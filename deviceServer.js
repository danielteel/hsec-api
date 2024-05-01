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

function startupDeviceServer(){
    if (server) return;
    
    server = new (require('net')).Server();

    server.listen(devicePort, function() {
        console.log(`Device server listening on port ${devicePort}`);
    });

    server.on('connection', function(socket) {
        socket.setTimeout(20000);
        console.log('Device connected');
        let thisDevice = {name: 'unknown', cachedImage: null, handshakeNumber: Uint32Array.from([Math.random()*4294967295]), socket};
        activeDevices.push(thisDevice);
        
        socket.write(uint32ToUint8(thisDevice.handshakeNumber));
        
        let packet={magic1: null, magic2: null, type: null, length_hi: null, length_mid: null, length_lo: null, length: null, payload: null, payloadWriteIndex: 0};

        const removeFromList = () => {
            activeDevices=activeDevices.filter( v => {
                if (v.socket===socket) return false;
                return true;
            });
        }

        function processData(buffer){
                for (let i=0;i<buffer.length;i++){
                    const byte=buffer[i];
                    if (packet.magic1===null){
                        packet.magic1=byte;
                        if (packet.magic1!=73){
                            console.log('incorrect magic 1 byte, disconnecting device');
                            removeFromList();
                            socket.destroy();
                        }
                    }else if (packet.magic2===null){
                        packet.magic2=byte;
                        if (packet.magic2!=31){
                            console.log('incorrect magic 2 byte, disconnecting device');
                            removeFromList();
                            socket.destroy();
                        }
                    }else if (packet.type===null){
                        packet.type=byte;
                    }else if (packet.length_hi===null){
                        packet.length_hi=byte;
                    }else if (packet.length_mid===null){
                        packet.length_mid=byte;
                    }else if (packet.length_lo===null){
                        packet.length_lo=byte;
                        packet.length=packet.length_lo+(packet.length_mid<<8)+(packet.length_hi<<16);
                        packet.payload = Buffer.alloc(packet.length);
                        packet.payloadWriteIndex=0;
                    }else{
                        const howFar = Math.min(packet.length, buffer.length-i);
                        buffer.copy(packet.payload, packet.payloadWriteIndex, i, howFar+i);
                        packet.payloadWriteIndex+=howFar;
                        if (packet.payloadWriteIndex>=packet.length){
                            //Process complete packet here
                            if (packet.type===0){
                                thisDevice.name=textDecoder.decode(decrypt(packet.payload, "4c97d02ae05b748dcb67234065ddf4b8f832a17826cf44a4f90a91349da78cba"));
                                console.log('device renamed to', thisDevice.name);
                            }else if (packet.type===1){
                                thisDevice.cachedImage=Buffer.from(decrypt(packet.payload, "4c97d02ae05b748dcb67234065ddf4b8f832a17826cf44a4f90a91349da78cba"));
                                console.log('device sent an image', thisDevice.name);
                            }else{
                                console.log('unknown packet type from device', thisDevice.name, packet.type);
                            }
                            packet={magic1: null, magic2: null, type: null, length_hi: null, length_mid: null, length_lo: null, length: null, payload: null, payloadWriteIndex: 0};
                        }
                        i+=howFar-1;
                    }
                }
        }

        socket.on('data', (chunk) => {
            processData(chunk);
        });

        socket.on('timeout', ()=>{
            socket.destroy();
            console.log('Device timeout');
            removeFromList();
        })

        socket.on('end', function() {
            console.log('Device disconnected');
            removeFromList();
        });

        socket.on('error', function(err) {
            console.log(`Device error: ${err}`);
        });
    });
}




module.exports = {startupDeviceServer, activeDevices};