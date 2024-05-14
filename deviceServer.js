const {encrypt, decrypt} = require('./encro');
const crypto = require('crypto');
const textDecoder = new TextDecoder;
// const textEncoder = new TextEncoder;

let server = null;

class DeviceIO {
    static devices = [];
    static deviceCounter=0;

    static getDevices(){
        return this.devices;
    }

    static removeDevice(device){
        try{
            if (device.socket){
                device.socket.destroy();
            }
        }catch{}
        this.devices=this.devices.filter( v => {
            if (v===device) return false;
            return true;
        });
    }

    static isNameConnected(name){
        for (const device of this.devices){
            if (device.name===name){
                return true;
            }
        }
        return false;
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
        this.deviceHandshakeNumber=null;
        this.name=null;

        this.socket.setNoDelay();

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
        this.tempName=null;
        this.nameLength=null;
        this.nameWriteIndex=0;
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
    }

    sendPacket = (data) => {
        if (data.length>(0x0FFFF0)){
            this.onError(this, this.name+' cant send a message bigger than 0x0FFFF0');
            return;
        }
        console.log("Sending packet with handshake ", this.handshakeNumber[0]);
  
        const encryptedData = encrypt(this.handshakeNumber[0], data, this.key);
        const header=new Uint8Array([73, 31, 0, 0, 0, 0]);
        (new DataView(header.buffer)).setUint32(2, encryptedData.length, true);
        this.socket.write(header);
        this.socket.write(encryptedData);


        this.handshakeNumber[0]++;
    }

    onData = (buffer) => {    
        for (let i=0;i<buffer.length;i++){
            const byte=buffer[i];
            if (this.magic1===null){
                this.magic1=byte;
            }else if (this.magic2===null){
                this.magic2=byte;
                if (this.magic1===73 && this.magic2===31){

                }else if (this.magic1===13 && this.magic2===37){
                    if (this.name!==null){
                        this.socket.destroy();
                        this.constructor.removeDevice(this);
                        this.onError(this, this.name+' already recieved initial handshake packet, closing connection');
                        return;
                    }
                }else{
                    this.socket.destroy();
                    this.constructor.removeDevice(this);
                    this.onError(this, this.name+' bad magic bytes, closing connection');
                    return;
                }
            }else if (this.nameLength===null && this.magic1===13 && this.magic2===37){
                this.nameLength=byte;
                this.tempName="";
                if (this.nameLength===0){
                    this.socket.destroy();
                    this.constructor.removeDevice(this);
                    this.onError(this, 'device name cant be zero length, closing connection');
                    return;
                }
            }else if (this.nameWriteIndex<this.nameLength && this.magic1===13 && this.magic2===37){
                this.tempName=this.tempName+String.fromCharCode(byte);
                this.nameWriteIndex++;
                if (this.nameWriteIndex>=this.nameLength){
                    if (this.constructor.isNameConnected(this.tempName)){
                        this.socket.destroy();
                        this.constructor.removeDevice(this);
                        this.onError(this, 'device with name '+this.tempName+' is already connected, closing connection');
                        return;
                    }
                    this.name=this.tempName;
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

                if (this.length>0x0FFFFF){
                    this.socket.destroy();
                    this.constructor.removeDevice(this);
                    this.onError(this, this.name+' device sent packet larger than 0x0FFFFF');
                }

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
                    if (this.deviceHandshakeNumber===null){
                        this.deviceHandshakeNumber=new Uint32Array([recvdHandshake]);
                        if (decrypted.length!=0){
                            const actions=textDecoder.decode(decrypted).split(',');
                            for (const action of actions){
                                const [name, type, commandByte] = action.split(':');
                                console.log(name, type, commandByte);
                            }
                        }
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

function createDeviceServer(){
    if (server) return;
    
    server = new (require('net')).Server();


    server.on('connection', function(socket) {
        console.log('Device connected');

        const onCompletePacket = (device, data) => {
            if (data[0]===0xFF && data[1]===0xD8){
                imageLibrary[device.name]=data;
                console.log('device sent an image', device.name);
            }
        }

        const onError = (device, msg) => {
            console.log('Device Error', msg);
        }

        const packetio = new DeviceIO(socket, "4c97d02ae05b748dcb67234065ddf4b8f832a17826cf44a4f90a91349da78cba", onCompletePacket, onError);
    });

    return server;
}




module.exports = {createDeviceServer, getDevices: DeviceIO.getDevices, getImageLibrary};