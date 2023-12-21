const express = require('express');
const {authenticate} = require('../common/accessToken');
const { needKnex } = require('../database');
const {getHash, verifyFields, generateVerificationCode, isLegalPassword} = require('../common/common');
const fetch = require('node-fetch');

const router = express.Router();
module.exports = router;

//Do i need this? trying to get protect against ../../../../../ attacks but I think send file already does that
function isValidFile(str){
    for (let i=0;i<str.length-1;i++){
        if (str[i]==='.' && str[i+1]==='.') return false;
    }
    return true;
}

router.post('/add', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try{
        const fields = [
            'type:~hls,jpg',
            'file:string',
            'title:string',
            'w:number',
            'h:number',
            'qual:number',
            'fps:number',
            'block:number:?'
        ]
        const [fieldCheck, type, file, title, w, h, qual, fps, block] = verifyFields(req.body, fields);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        await req.knex('formats').insert({type, file, title, w, h, qual, fps, block});
        
        try{
            await fetch('http://127.0.0.1:'+process.env.FFMPEG_PORT+'/update/'+process.env.FFMPEG_SECRET);
        }catch(e){
            console.error('ERROR POST /cam/add', req.body, e);
        }

        res.status(200).json({status:'success'});
    }catch(e){
        console.error('ERROR POST /cam/add', req.body, e);
        return res.status(400).json({error: 'error'});
    }
})

router.post('/delete', [needKnex, authenticate.bind(null, 'admin')], async (req, res) => {
    try {
        const [fieldCheck, which] = verifyFields(req.body, ['which:any']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck})

        if (typeof which==='number'){
            await req.knex('formats').where({id: which}).delete();
        }else if (Array.isArray(which)){
            await req.knex('formats').whereIn('id', which).delete();
        }else{
            throw Error('invalid which type');
        }
        
        try{
            await fetch('http://127.0.0.1:'+process.env.FFMPEG_PORT+'/update/'+process.env.FFMPEG_SECRET);
        }catch{}
        
        res.status(200).json({status: 'success'});
    }catch(e){
        console.error('ERROR POST /cam/delete', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.get('/details', [needKnex, authenticate.bind(null, 'member')], async (req, res) => {
    try {
        const formats = await req.knex('formats').select('*');
        res.json(formats);
    }catch(e){
        console.error('ERROR GET /cam/details', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.get('/:file', authenticate.bind(null, 'member'), (req, res) => {
    try {
        if (!isValidFile(req.params.file)){
            res.status(404).json({error: 'not found'});
        }else{
            res.sendFile(process.env.CAM_DIR + req.params.file);
        }
    } catch (e){
        console.error('ERROR /cam/:file', req.body, e);
        res.status(400).json({error: 'error'});
    }
});