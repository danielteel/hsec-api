const {encrypt, decrypt} = require('./encro');
const textDecoder = new TextDecoder;
const textEncoder = new TextEncoder;
let activeDevices = [];

function logDevices(){
    console.log(activeDevices.map((v)=>v.name));
    setTimeout(logDevices, 5000);
}
logDevices();

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

function removeFromActiveDevices(device){
    activeDevices=activeDevices.filter( v => {
        if (v.socket===device.socket) return false;
        return true;
    });
}

function getActiveDevices(){
    return activeDevices;
}


class PacketIO {
    constructor(socket, key, onCompletePacket, onError){
        this.onCompletePacket=onCompletePacket;
        this.onError=onError;
        this.errorOccured=false;
        this.key=key;
        this.reset();
        this.socket=socket;
        this.deviceHandshakeNumber=null;
        this.handshakeNumber=Uint32Array.from([Math.random()*4294967295]);

        this.sendInitialHandshake();

        socket.on('data', onData);
    }

    reset = () => {
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
        this.socket.write(new Uint8Array([73, 31, 0, 0, 0, 4]));
        this.socket.write(uint32ToUint8(this.handshakeNumber));
    }

    sendPacket = (type, data) => {
        if (data.length>(0xFFFFFB)){
            this.onError('cant send a message bigger than 0xFFFFFB');
            return;
        }
        const len = new Uint32Array([data.length+4]);
        const lenBytes=uint32ToUint8(len);

        this.socket.write(new Uint8Array([73, 31, type, lenBytes[1], lenBytes[2], lenBytes[3]]));
        this.socket.write(uint32ToUint8(this.handshakeNumber));
        this.socket.write(Buffer.from(data));

        this.handshakeNumber++
    }

    onData = (buffer) => {
        if (this.errorOccured) return;
    
        for (let i=0;i<buffer.length;i++){
            const byte=buffer[i];
            if (this.magic1===null){
                this.magic1=byte;
            }else if (this.magic2===null){
                this.magic2=byte;
                if (this.magic1!=73 || this.magic2!=31){
                    this.onError('bad magic bytes, restart connection');
                    this.errorOccured=true;
                    return;
                }
            }else if (this.type===null){
                this.type=byte;
                if (this.type!==0 && this.deviceHandshakeNumber===null){
                    this.onError('handshake needs to happen first, restart connection');
                    this.errorOccured=true;
                    return;
                }
            }else if (this.length_hi===null){
                this.length_hi=byte;
            }else if (this.length_mid===null){
                this.length_mid=byte;
            }else if (this.length_lo===null){
                this.length_lo=byte;
                this.length=this.length_lo+(this.length_mid<<8)+(this.length_hi<<16);

                if (this.deviceHandshakeNumber===null && this.length!=4){
                    this.onError('handshake packet needs to be 4 bytes');
                    this.errorOccured=true;
                    return;
                }

                this.payload = Buffer.alloc(this.length);
                this.payloadWriteIndex=0;
            }else{
                const howFar = Math.min(this.length, buffer.length-i);
                buffer.copy(this.payload, this.payloadWriteIndex, i, howFar+i);
                this.payloadWriteIndex+=howFar;
                if (this.payloadWriteIndex>=this.length){
                    //Process complete packet here
                    const decrypted = decrypt(this.payload, this.key);
                    const recvdHandshake = decrypted[0]<<24 | decrypted[1]<<16 | decrypted[2]<<8 | decrypted[3];
                    if (this.deviceHandshakeNumber===null){
                        this.deviceHandshakeNumber=recvdHandshake;
                    }else{
                        if (recvdHandshake!=this.deviceHandshakeNumber[0]){
                            this.onError('incorrect handshake number, restart connection');
                            this.errorOccured=true;
                            return;
                        }
                        this.deviceHandshakeNumber[0]++;
                        this.onCompletePacket(this.type, Buffer.from(decrypted, 4));
                    }
                    this.reset();
                }
                i+=howFar-1;
            }
        }
    }
}

function startupDeviceServer(){
    if (server) return;
    
    server = new (require('net')).Server();

    server.listen(devicePort, function() {
        console.log(`Device server listening on port ${devicePort}`);
    });

    server.on('connection', function(socket) {
        console.log('Device connected');

        socket.setTimeout(20000);

        let thisDevice = {name: 'unknown', cachedImage: null, handshakeNumber: Uint32Array.from([Math.random()*4294967295]), socket};
        activeDevices.push(thisDevice);


        const onCompletePacket = (type, data) => {
            if (type===0){
                thisDevice.name=textDecoder.decode(data);
                console.log('device renamed to', thisDevice.name);
            }else if (type===1){
                thisDevice.cachedImage=Buffer.from(data);
                console.log('device sent an image', thisDevice.name);
            }else{
                console.log('unknown packet type from device', thisDevice.name, type);
            }
        }
        const onError = (msg) => {
            console.log('PacketIO error', thisDevice.name, msg);
            socket.destroy();
            removeFromActiveDevices(thisDevice);
        }

        const packetio = new PacketIO(socket, "4c97d02ae05b748dcb67234065ddf4b8f832a17826cf44a4f90a91349da78cba", onCompletePacket, onError);
        
        socket.on('timeout', ()=>{
            socket.destroy();
            console.log('Device timeout');
            removeFromActiveDevices(thisDevice);
        })

        socket.on('end', function() {
            console.log('Device disconnected');
            removeFromActiveDevices(thisDevice);
        });

        socket.on('error', function(err) {
            console.log(`Device error: ${err}`);
        });
    });
}




module.exports = {startupDeviceServer, getActiveDevices};