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

function startupDeviceServer(){
    if (server) return;
    
    server = new (require('net')).Server();

    server.listen(devicePort, function() {
        console.log(`Device server listening on port ${devicePort}`);
    });

    server.on('connection', function(socket) {
        socket.setTimeout(20000);
        console.log('Device connected');
        let thisDevice = {name: 'unknown', cachedImage: null, socket};
        activeDevices.push(thisDevice);
        
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
                                thisDevice.name=packet.payload.toString();
                                console.log('device renamed to', thisDevice.name);
                            }else if (packet.type===1){
                                thisDevice.cachedImage=packet.payload;
                            }else{
                                console.log('unknown packet type from device', packet.type);
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