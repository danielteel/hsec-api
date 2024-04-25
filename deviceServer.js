let activeDevices = [];

let server = null;

function startupDeviceServer(){
    if (server) return;
    
    server = new (require('net')).Server();

    server.listen(process.env.DEVICES_PORT, function() {
        console.log(`Device server listening on port ${process.env.DEVICES_PORT}`);
    });

    server.on('connection', function(socket) {
        console.log('Device connected');
        activeDevices.push(socket);

        socket.on('data', function(chunk) {
            console.log(`Device data received from client: ${chunk.toString()}`);
        });

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