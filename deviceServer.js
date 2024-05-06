const {encrypt, decrypt} = require('./encro');
const textDecoder = new TextDecoder;
// const textEncoder = new TextEncoder;

let server = null;

const devicePort = process.env.API_DEV_PORT || 4004;

/*
struct packet{
    uint_8t magic1 = 73
    uint_8t magic2 = 31
    uint_8t messageType;
    uint_8t length_hi;//Size of payload hi being the highest value byte, mid being the middle, and lo being the lowest value byte
    uint_8t length_mid;
    uint_8t length_lo;
    uint_8t* payload
}
*/

function uint32ToUint8(uint32array){
    return new Uint8Array([(uint32array[0]>>24)&0xFF, (uint32array[0]>>16)&0xFF, (uint32array[0]>>8)&0xFF, uint32array[0]&0xFF]);
}



class DeviceIO {
    static devices = [];
    static deviceCounter=0;

    static getDevices(){
        return this.devices;
    }

    static removeDevice(device){
        this.devices=this.devices.filter( v => {
            if (v===device) return false;
            return true;
        });
    }

    static addDevice(device){
        this.devices.push(device);
    }

    constructor(socket, key, onCompletePacket, onError){
        this.constructor.addDevice(this);

        this.onCompletePacket=onCompletePacket;
        this.onError=onError;
        this.key=key;
        this.resetPacketData();
        this.socket=socket;
        this.name='Device '+this.constructor.deviceCounter++;
        this.deviceHandshakeNumber=null;

        this.handshakeNumber=Uint32Array.from([Math.random()*4294967295]);
        this.sendInitialHandshake();

        socket.setTimeout(20000);
        socket.on('data', this.onData);
        socket.on('end', () => {
            this.constructor.removeDevice(this);
        });        
        socket.on('timeout', () => {
            socket.destroy();
            this.constructor.removeDevice(this);
            this.onError(this, this.name+' timed out, closing connection');
        });
        socket.on('error', (err)=>{
            socket.destroy();
            this.constructor.removeDevice(this);
            this.onError(this, this.name+' '+err);
        });
    }

    resetPacketData = () => {
        this.magic1=null;
        this.magic2=null;
        this.type=null;
        this.length_hi=null;
        this.length_mid=null;
        this.length_lo=null;
        this.payload=null;
        this.payloadWriteIndex=0;
    }

    sendInitialHandshake = () => {
        const encryptedData = encrypt(uint32ToUint8(this.handshakeNumber), this.key);
        const lenBytes=uint32ToUint8(new Uint32Array([encryptedData.length]));

        this.socket.write(new Uint8Array([73, 31, 0, lenBytes[1], lenBytes[2], lenBytes[3]]));
        this.socket.write(encryptedData);
    }

    sendPacket = (type, data) => {
        if (data.length>(0xFFFF00)){
            this.onError(this, this.name+' cant send a message bigger than 0xFFFF00');
            return;
        }
        console.log("Sending packet with handshake ", this.handshakeNumber[0]);
        const allTheData = Buffer.concat([uint32ToUint8(this.handshakeNumber), Buffer.from(data)]);
  
        const encryptedData = encrypt(allTheData, this.key);
        const lenBytes=uint32ToUint8(new Uint32Array([encryptedData.length]));

        this.socket.write(new Uint8Array([73, 31, type, lenBytes[1], lenBytes[2], lenBytes[3]]));
        this.socket.write(encryptedData);
        console.log(encryptedData);

        this.handshakeNumber[0]++;
    }

    onData = (buffer) => {    
        for (let i=0;i<buffer.length;i++){
            const byte=buffer[i];
            if (this.magic1===null){
                this.magic1=byte;
            }else if (this.magic2===null){
                this.magic2=byte;
                if (this.magic1!=73 || this.magic2!=31){
                    this.socket.destroy();
                    this.constructor.removeDevice(this);
                    this.onError(this, this.name+' bad magic bytes, closing connection');
                    return;
                }
            }else if (this.type===null){
                this.type=byte;
                if (this.type!==0 && this.deviceHandshakeNumber===null){
                    this.socket.destroy();
                    this.constructor.removeDevice(this);
                    this.onError(this, this.name+' handshake needs to happen first, closing connection');
                    return;
                }
            }else if (this.length_hi===null){
                this.length_hi=byte;
            }else if (this.length_mid===null){
                this.length_mid=byte;
            }else if (this.length_lo===null){
                this.length_lo=byte;
                this.length=this.length_lo+(this.length_mid<<8)+(this.length_hi<<16);

                this.payload = Buffer.alloc(this.length);
                this.payloadWriteIndex=0;
            }else{
                const howFar = Math.min(this.length, buffer.length-i);
                buffer.copy(this.payload, this.payloadWriteIndex, i, howFar+i);
                this.payloadWriteIndex+=howFar;
                if (this.payloadWriteIndex>=this.length){
                    //Process complete packet here
                    console.log('packet recieved');
                    const decrypted = decrypt(this.payload, this.key);
                    const recvdHandshake = new Uint32Array([decrypted[0]<<24 | decrypted[1]<<16 | decrypted[2]<<8 | decrypted[3]]);
                    if (this.deviceHandshakeNumber===null){
                        this.deviceHandshakeNumber=recvdHandshake;
                    }else{
                        if (recvdHandshake[0]!=this.deviceHandshakeNumber[0]){
                            this.socket.destroy();
                            this.constructor.removeDevice(this);
                            this.onError(this, this.name+' incorrect handshake number, closing connection, recvd: '+recvdHandshake[0]+' expected: '+this.deviceHandshakeNumber[0]);
                            return;
                        }
                        this.deviceHandshakeNumber[0]++;
                        if (this.type===1){
                            this.name=textDecoder.decode(decrypted.subarray(4));
                        }else{
                            this.onCompletePacket(this, this.type, decrypted.subarray(4));
                        }
                    }
                    this.resetPacketData();
                }
                i+=howFar-1;
            }
        }
    }
}

const imageLibrary={};

function getImageLibrary(){
    return imageLibrary;
}

function startupDeviceServer(){
    if (server) return;
    
    server = new (require('net')).Server();

    server.listen(devicePort, function() {
        console.log(`Device server listening on port ${devicePort}`);
    });


    server.on('connection', function(socket) {
        console.log('Device connected');

        const onCompletePacket = (device, type, data) => {
            if (type===2){
                imageLibrary[device.name]=data;
                console.log('device sent an image', device.name);
                device.sendPacket(3, 'open or close the door, whatever you want to do.');
            }else{
                console.log('unknown packet type from device', device.name, type);
            }
        }

        const onError = (device, msg) => {
            console.log('Device Error', msg);
        }

        const packetio = new DeviceIO(socket, "4c97d02ae05b748dcb67234065ddf4b8f832a17826cf44a4f90a91349da78cba", onCompletePacket, onError);
    });
}




module.exports = {startupDeviceServer, getDevices: DeviceIO.getDevices, getImageLibrary};