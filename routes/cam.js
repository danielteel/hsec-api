const express = require('express');
const {authenticate} = require('../common/accessToken');
const { needKnex } = require('../database');


const router = express.Router();
module.exports = router;

//Do i need this? trying to get protect against ../../../../../ attacks but I think send file already does that
function isValidFile(str){
    for (let i=0;i<str.length-1;i++){
        if (str[i]==='.' && str[i+1]==='.') return false;
    }
    return true;
}

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