const {spawn} = require('node:child_process');

const {app} = require('./app.js');
const { mkdirSync }=require('node:fs');


const port = 4001;


const server = app.listen(port, () => {
        console.log('listening on '+port)
});


(()=>{
    try {
        mkdirSync('/mnt/ramdisk/cam');
    }catch (e){        
        if (e.code !== 'EEXIST') {
            console.log(e);
            process.exit(-1);
        }
    }
    const args = [
        '-i', '/dev/video0',
        '-s', '960x540',
        '-r', '4',
        '-g', '5',
        '-c:v', 'libx264',
        '-crf', '28',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-hls_time', '1.25',
        '-hls_list_size', '3',
        '-hls_flags', 'delete_segments',
        '/mnt/ramdisk/cam/allcamL.m3u8',
    ]
    const child = spawn('ffmpeg', args);
    console.log('ffmpeg started')
    child.on('exit', (code) => {
        console.log(`ffmpeg process exited with code ${code}`);
    });
    child.stderr.on('data', (data) => null);
    child.stdout.on('data', (data) => null);
})();