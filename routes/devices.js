const express = require('express');
const {authenticate} = require('../common/accessToken');
const { needKnex } = require('../database');
const {getHash, verifyFields, generateVerificationCode, isLegalPassword} = require('../common/common');
const fetch = require('node-fetch');

const router = express.Router();
module.exports = router;


router.get('/devices', [needKnex, authenticate.bind(null, 'member')], async (req, res) => {
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