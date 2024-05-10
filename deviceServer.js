const {encrypt, decrypt} = require('./encro');
const crypto = require('crypto');
const textDecoder = new TextDecoder;
// const textEncoder = new TextEncoder;

let server = null;

const devicePort = process.env.API_DEV_PORT || 4004;


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

        this.handshakeNumber=Uint32Array.from([crypto.randomInt(4294967295)]);
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
        this.length1=null;
        this.length2=null;
        this.length3=null;
        this.length4=null;
        this.payload=null;
        this.payloadWriteIndex=0;
    }

    sendInitialHandshake = () => {
        const encryptedData = encrypt(this.handshakeNumber[0], null, this.key);

        const header=new Uint8Array([73, 31, 0, 0, 0, 0]);
        (new DataView(header.buffer)).setUint32(2, encryptedData.length, true);
        console.log(header, this.handshakeNumber[0]);
        this.socket.write(header);
        this.socket.write(encryptedData);
        //this.sendPacket(new Uint8Array([2, 0]));
       // this.sendPacket(new Uint8Array([1, 0]));
    }

    sendPacket = (data) => {
        if (data.length>(0xFFFFFF00)){
            this.onError(this, this.name+' cant send a message bigger than 0xFFFFFF00');
            return;
        }
        console.log("Sending packet with handshake ", this.handshakeNumber[0]);
  
        const encryptedData = encrypt(this.handshakeNumber[0], data, this.key);
        const header=new Uint8Array([73, 31, 0, 0, 0, 0]);
        (new DataView(header.buffer)).setUint32(2, encryptedData.length, true);
        this.socket.write(header);
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
            }else if (this.length1===null){
                this.length1=byte;
            }else if (this.length2===null){
                this.length2=byte;
            }else if (this.length3===null){
                this.length3=byte;
            }else if (this.length4===null){
                this.length4=byte;

                const temp = new Uint8Array([this.length1, this.length2, this.length3, this.length4]);
                const tempView = new DataView(temp.buffer);
                this.length=tempView.getUint32(0, true);

                this.payload = Buffer.alloc(this.length);
                this.payloadWriteIndex=0;
            }else{
                const howFar = Math.min(this.length, buffer.length-i);
                buffer.copy(this.payload, this.payloadWriteIndex, i, howFar+i);
                this.payloadWriteIndex+=howFar;
                if (this.payloadWriteIndex>=this.length){
                    //Process complete packet here
                    console.log('packet recieved');
                    const {data: decrypted, handshake: recvdHandshake} = decrypt(this.payload, this.key);
                    if (this.deviceHandshakeNumber===null && decrypted.length===0){
                        this.deviceHandshakeNumber=new Uint32Array([recvdHandshake]);
                    }else if (recvdHandshake!=this.deviceHandshakeNumber[0]){
                        this.socket.destroy();
                        this.constructor.removeDevice(this);
                        this.onError(this, this.name+' incorrect handshake number, closing connection, recvd: '+recvdHandshake[0]+' expected: '+this.deviceHandshakeNumber[0]);
                        return;
                    }else{
                        this.deviceHandshakeNumber[0]++;
                        this.onCompletePacket(this, decrypted);
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

        const onCompletePacket = (device, data) => {
            if (data[0]===0xFF && data[1]===0xD8){
                imageLibrary[device.name]=data;
                console.log('device sent an image', device.name);
                //device.sendPacket(new Uint8Array([3]));
            }else{
                device.name=textDecoder.decode(data);
            }
        }

        const onError = (device, msg) => {
            console.log('Device Error', msg);
        }

        const packetio = new DeviceIO(socket, "4c97d02ae05b748dcb67234065ddf4b8f832a17826cf44a4f90a91349da78cba", onCompletePacket, onError);
    });
}




module.exports = {startupDeviceServer, getDevices: DeviceIO.getDevices, getImageLibrary};