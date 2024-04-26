let activeDevices = [];

let server = null;

const devicePort = process.env.API_DEV_PORT || 4004;

function startupDeviceServer(){
    if (server) return;
    
    server = new (require('net')).Server();

    server.listen(devicePort, function() {
        console.log(`Device server listening on port ${devicePort}`);
    });

    server.on('connection', function(socket) {
        console.log('Device connected');
        activeDevices.push(socket);

        socket.write(Buffer.from('1'));
        setTimeout(()=>{
            socket.write(Buffer.from('1'));
        },5000);

        socket.on('data', function(chunk) {
            console.log(`Device data received from client: ${chunk.toString().substring(0,20)}`);
        });
        socket.on('timeout', ()=>{
            console.log('Device disconnected');
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