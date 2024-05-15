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
//new DeviceIO(this.socket, this.name, this.key, this.deviceHandshakeNumber, this.actions, this.onCompletePacket, this.onError);
    constructor(socket, name, key, deviceHandshakeNumber, actions, onCompletePacket, onError){
        this.constructor.addDevice(this);

        this.name=name;
        this.deviceHandshakeNumber=deviceHandshakeNumber;
        this.actions=actions;
        this.onCompletePacket=onCompletePacket;
        this.onError=onError;
        this.key=key;
        this.resetPacketData();
        this.socket=socket;

        this.socket.setNoDelay();

        this.handshakeNumber=Uint32Array.from([crypto.randomInt(4294967295)]); 

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

        this.sendInitialHandshake();
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

        const header=new Uint8Array([13, 37, 0, 0, 0, 0]);
        (new DataView(header.buffer)).setUint32(2, encryptedData.length, true);
        
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
                    try{
                        const {data: decrypted, handshake: recvdHandshake} = decrypt(this.payload, this.key);
                        if (recvdHandshake!=this.deviceHandshakeNumber[0]){
                            this.socket.destroy();
                            this.constructor.removeDevice(this);
                            this.onError(this, this.name+' incorrect handshake number, closing connection, recvd: '+recvdHandshake[0]+' expected: '+this.deviceHandshakeNumber[0]);
                            return;
                        }else{
                            this.deviceHandshakeNumber[0]++;
                            this.onCompletePacket(this, decrypted);
                        }
                        this.resetPacketData();
                    }catch(e){
                        this.socket.destroy();
                        this.constructor.removeDevice(this);
                        this.onError(this, this.name+' failed to decrypt incoming packet');
                        return; 
                    }
                }
                i+=howFar-1;
            }
        }
    }
}

class UndeterminedDevice {
    constructor(socket, onCompletePacket, onError){
        this.socket=socket;
        this.onError=onError;
        this.onCompletePacket=onCompletePacket;
        
        this.magic1=null;
        this.magic2=null;
        this.name=null;
        this.nameLength=null;
        this.nameWriteIndex=0;
        this.deviceHandshakeNumber=null;
        this.length=null;
        this.length1=null;
        this.length2=null;
        this.length3=null;
        this.length4=null;
        this.payload=null;
        this.payloadWriteIndex=0;
        this.actions=[];
        this.key=null;

        socket.setTimeout(20000);
        
        socket.on('data', this.onData);  
        socket.on('timeout', () => {
            socket.destroy();
            this.onError('undetermined device timed out, closing connection');
        });
        socket.on('error', (err)=>{
            socket.destroy();
            this.onError('undetermined device had an error '+err);
        });
    }

    onData = async (buffer) => {    
        for (let i=0;i<buffer.length;i++){
            const byte=buffer[i];
            if (this.magic1===null){
                this.magic1=byte;
            }else if (this.magic2===null){
                this.magic2=byte;
                if (this.magic1!=13 || this.magic2!=37){
                    this.socket.destroy();
                    this.onError('undetermined device had bad magic bytes, closing connection');
                    return;
                }
            }else if (this.nameLength===null){
                this.nameLength=byte;
                this.name="";
                if (this.nameLength===0){
                    this.socket.destroy();
                    this.onError('undetermined device tried to have 0 length name, closing connection');
                    return;
                }
            }else if (this.nameWriteIndex<this.nameLength){
                this.name+=String.fromCharCode(byte);
                this.nameWriteIndex++;
                if (this.nameWriteIndex>=this.nameLength){
                    if (DeviceIO.isNameConnected(this.name)){
                        this.socket.destroy();
                        this.onError('device with name '+this.name+' is already connected, closing connection');
                        return;
                    }
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
                    this.onError(this.name+' device sent packet larger than 0x0FFFFF');
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
                    
                    try{
                        const [{encro_key}] = await req.knex('devices').select('encro_key').where({name: this.name});
                        this.key=encro_key;
                        if (!this.key){
                            this.socket.destroy();
                            this.onError('device record "'+this.name+'" not found');
                            return;
                        }

                        const {data: decrypted, handshake: recvdHandshake} = decrypt(this.payload, this.key);
                        this.deviceHandshakeNumber=new Uint32Array([recvdHandshake]);

                        if (decrypted.length!=0){
                            const actions=textDecoder.decode(decrypted).split(',');
                            for (const action of actions){
                                const [name, type, commandByte] = action.split(':');
                                this.actions.push({name, type, commandByte});
                            }
                        }
                        new DeviceIO(this.socket, this.name, this.key, this.deviceHandshakeNumber, this.actions, this.onCompletePacket, this.onError);
                        this.socket.removeAllListeners();
                    }catch(e){                
                        this.socket.destroy();
                        this.onError('failed to fetch or decrypt device data');
                    }
                }
                i+=howFar-1;
            }
        }
    }
}

function createDeviceServer(){
    if (server) return;
    
    server = new (require('net')).Server();


    server.on('connection', function(socket) {
        console.log('Device connected');

        const onCompletePacket = (device, data) => {
            if (data[0]===0xFF && data[1]===0xD8){
                device.image=data;
                console.log('device sent an image', device.name);
            }
        }

        const onError = (device, msg) => {
            console.log('Device Error', device.name, msg);
        }

        const packetio = new DeviceIO(socket, "4c97d02ae05b748dcb67234065ddf4b8f832a17826cf44a4f90a91349da78cba", onCompletePacket, onError);
    });

    return server;
}




module.exports = {createDeviceServer, DeviceIO};