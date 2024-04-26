let activeDevices = [];

let server = null;

const devicePort = process.env.API_DEV_PORT || 4004;

/*
struct packet{
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
        console.log('Device connected');
        activeDevices.push(socket);
        
        let packet={type: null, length_hi: null, length_mid: null, length_lo: null, length: null};
        let buffers=[];

        function processData(){
            for (const buffer of buffers){
                for (const byte of buffer){
                    if (packet.type===null){
                        packet.type=byte;
                    }else if (packet.length_hi===null){
                        packet.length_hi=byte;
                    }else if (packet.length_mid===null){
                        packet.length_mid=byte;
                    }else if (packet.length_lo===null){
                        packet.length_lo=byte;
                        packet.length=packet.length_lo+(packet.length_mid<<8)+(packet.length_hi<<16);
                    }
                }
            }
        }

        socket.on('data', function(chunk) {
            console.log(`Device data received from client: ${chunk.toString().substring(0,20)}`);
            buffers.push(chunk);
        });

        socket.on('timeout', ()=>{
            console.log('Device timeout');
            activeDevices=activeDevices.filter( v => {
                if (v===socket) return false;
                return true;
            });
        })

        socket.on('end', function() {
            console.log('Device disconnected');
            activeDevices=activeDevices.filter( v => {
                if (v===socket) return false;
                return true;
            });
        });

        socket.on('error', function(err) {
            console.log(`Device error: ${err}`);
        });
    });
}




module.exports = {startupDeviceServer, activeDevices};