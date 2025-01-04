const {encrypt, decrypt} = require('./encro');
const crypto = require('crypto');
const {getKnex} = require('./database');


const textDecoder = new TextDecoder;
const textEncoder = new TextEncoder;


let server = null;



class PACKETSTATE {
    // Private Fields
    static get NAMELEN() { return 0; }
    static get NAME() { return 1; }
    static get LEN1() { return 2; }
    static get LEN2() { return 3; }
    static get LEN3() { return 4; }
    static get LEN4() { return 5; }
    static get PAYLOAD() { return 6; }
    static get ERROR() { return 7; }
}

class NETSTATUS {
    static get OPENED() { return 1; }
    static get READY() { return 2; }
    static get ERROR() { return 3; }
}

class DeviceIO {
    static socketTimeoutTime = 30000;
    static devices=[];
    

    static getDevices = () => {
        return this.devices;
    }

    static removeDevice = (device) => {
        try{
            if (device.socket){
                device.socket.destroy();
            }
        }catch{
        }
        this.devices=this.devices.filter( v => {
            if (v===device) return false;
            return true;
        });
    }

    static isNameConnected = (name) =>{
        for (const device of this.devices){
            if (device.name===name){
                return true;
            }
        }
        return false;
    }

    static addDevice = (device) => {
        this.devices.push(device);
    }

    constructor(socket){
        this.onDone=()=>{
            console.log("Device disconnected: ",this.name);
            this.constructor.removeDevice(this);
        };

        this.socket=socket;
        this.socket.setTimeout(this.constructor.socketTimeoutTime);
    
        socket.on('data', this.onData);

        this.netStatus=NETSTATUS.OPENED;
        this.packetState=PACKETSTATE.NAMELEN;

        this.pauseReading=false;
        this.buffersWhilePaused=[];

        this.nameLength=0;
        this.nameWriteIndex=0;
        this.name=null;
        this.key=null;
        this.clientHandshake=Uint32Array.from([0]);
        this.serverHandshake=Uint32Array.from([crypto.randomInt(4294967295)]); 

        this.payloadLength=0;
        this.payloadWriteIndex=0;
        this.payload=null;

        this.actions=null;

        socket.on('end', () => {
            console.log('name',this.name, this.socket.address, 'disconnected');
            this.deviceErrored();
        });        
        socket.on('timeout', () => {
            console.log('name',this.name, this.socket.address, 'timed out');
            this.deviceErrored();
        });
        socket.on('error', (err)=>{
            console.log('name',this.name, this.socket.address, 'error occured', err);
            this.deviceErrored();
        });
    }

    sendAction = (actionTitle, data) => {
        if (!Array.isArray(this.actions)) return false;
        for (const action of this.actions){
            if (action.title.toLowerCase().trim()===actionTitle.toLowerCase().trim()){
                switch (action.type.toLowerCase().trim()){
                    case 'void':
                        this.sendPacket(new Uint8Array([action.commandByte]));
                        return true;
                    case 'byte':
                        this.sendPacket(new Uint8Array([action.commandByte, data]));
                        return true;
                }
            }
        }
        return false;
    }

    pauseIncomingData = () => {
        this.pauseReading=true;
    }
    unpauseIncomingData = () => {
        //Must not pause incoming data again until this returns
        this.pauseReading=false;
        for (const buffer of this.buffersWhilePaused){
            this.onData(buffer);
        }
        this.buffersWhilePaused=[];
    }

    deviceErrored = () => {
        this.socket.destroy();
        this.socket=null;
        this.payload=null;
        this.packetState=PACKETSTATE.ERROR;
        this.netStatus=NETSTATUS.ERROR;
        this.onDone(this);
    }

    sendPacket = (data) => {
        if (typeof data==='string') data=textEncoder.encode(data);
        if (data && data.length>0x0FFFF0){
            console.log(this.name, this.socket.address, 'cant send a message bigger than 0x0FFFF0');
            return false;
        }
  
        const encryptedData = encrypt(this.serverHandshake[0], data, this.key);
        const header=new Uint8Array([0, 0, 0, 0]);
        (new DataView(header.buffer)).setUint32(0, encryptedData.length, true);
        this.socket.write(header);
        this.socket.write(encryptedData);

        this.serverHandshake[0]++;

        return true;
    }

    onFullPacket = (handshake, data) => {
        if (this.netStatus===NETSTATUS.OPENED){                        
            this.clientHandshake[0]=handshake;
            this.clientHandshake[0]++;
            this.netStatus=NETSTATUS.READY;
            this.sendPacket(null);
        }else{
            if (this.clientHandshake[0]!==handshake){
                console.log(this.name, this.socket.address, 'incorrect handshake, exepcted '+this.clientHandshake[0]+' but recvd '+handshake);
                this.deviceErrored();
                return;
            }
            
            if (data){
                if (data[0]===0xFF && data[1]===0xD8){
                    this.image=data;
                }else if (data[0]==='i'.charCodeAt(0) && data[1]==='='.charCodeAt(0)){
                    //Device sent interface information
                    this.actions=[];
                    const actions=textDecoder.decode(data).slice(2).split(',');
                    for (const action of actions){
                        const [title, type, commandByte] = action.split(':');
                        this.actions.push({title, type, commandByte});
                    }
                }else if (data[0]=='w'.charCodeAt(0) && data[1]==='='.charCodeAt(0)){
                    console.log(textDecoder.decode(data).slice(2));
                    const variables=textDecoder.decode(data).slice(2).split(',');
                    this.weather={};
                    for (const variable of variables){
                        const [name, value] = variable.split(':');
                        this.weather[name]=value;
                    }
                }
            }
            this.clientHandshake[0]++;
        }
    }

    onData = (buffer) => {
        if (this.pauseReading){
            this.buffersWhilePaused.push(buffer);
            return;
        }

        for (let i=0;i<buffer.length;i++){
            const byte=buffer[i];
            if (this.netStatus===NETSTATUS.OPENED && this.packetState===PACKETSTATE.NAMELEN){
                this.nameLength=byte;
                this.name="";
                this.packetState=PACKETSTATE.NAME;
            }else if (this.netStatus===NETSTATUS.OPENED && this.packetState===PACKETSTATE.NAME){
                this.name+=String.fromCharCode(byte);
                this.nameWriteIndex++;
                if (this.nameWriteIndex>=this.nameLength){
                    //Get device encro key from database or wherever
                    this.pauseIncomingData();
                    if (i+1<buffer.length){
                        this.buffersWhilePaused.push(buffer.subarray(i+1));
                    }
                    getKnex()('devices').select('encro_key').where({name: this.name}).then( (val) => {
                        if (val && val[0] && val[0].encro_key){
                            this.key=val[0].encro_key;
                            if (this.constructor.isNameConnected(this.name)){
                                this.deviceErrored();
                                console.log('device "'+this.name+'"is already connected');
                            }else{
                                this.packetState=PACKETSTATE.LEN1;
                                this.unpauseIncomingData();
                                this.constructor.addDevice(this);
                            }
                        }else{
                            this.deviceErrored();
                            console.log('device record "'+this.name+'" not found');
                        }
                    });
                    return;
                }
            }else if (this.packetState===PACKETSTATE.LEN1){
                this.payloadLength=byte;
                this.packetState=PACKETSTATE.LEN2;

            }else if (this.packetState===PACKETSTATE.LEN2){
                this.payloadLength|=byte<<8;
                this.packetState=PACKETSTATE.LEN3;

            }else if (this.packetState===PACKETSTATE.LEN3){
                this.payloadLength|=byte<<16;
                this.packetState=PACKETSTATE.LEN4;

            }else if (this.packetState===PACKETSTATE.LEN4){
                this.payloadLength|=byte<<24;
                this.packetState=PACKETSTATE.PAYLOAD;

                if (this.payloadLength>0x0FFFFF){
                    console.log(this.name, this.socket.address, 'device sent packet larger than 0x0FFFFF');
                    this.deviceErrored();
                    return;
                }

                this.payload = Buffer.alloc(this.payloadLength);
                this.payloadWriteIndex=0;

            }else if (this.packetState===PACKETSTATE.PAYLOAD){
                const howFar = Math.min(this.payloadLength, buffer.length-i);
                buffer.copy(this.payload, this.payloadWriteIndex, i, howFar+i);
                this.payloadWriteIndex+=howFar;
                if (this.payloadWriteIndex>=this.payloadLength){
                    //Process complete packet here
                    try{
                        const {data: decrypted, handshake: recvdHandshake} = decrypt(this.payload, this.key);
                        this.onFullPacket(recvdHandshake, decrypted);
                        this.packetState=PACKETSTATE.LEN1;
                    }catch(e){
                        console.log('name',this.name, 'failed to decrypt packet:', e);
                        this.deviceErrored();
                        return;
                    }
                }
                i+=howFar-1;
            }else{
                console.log('name',this.name, this.socket.address, 'unknown packet/net status', this.packetState+'/'+this.netStatus);
                this.deviceErrored();
                return;
            }
        }
    }
}

function createDeviceServer(){
    if (server) return;
    
    server = new (require('net')).Server();

    server.on('connection', function(socket) {
        new DeviceIO(socket);
    });

    return server;
}

module.exports = {createDeviceServer, DeviceIO};