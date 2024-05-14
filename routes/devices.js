const express = require('express');
const {authenticate} = require('../common/accessToken');
const { needKnex } = require('../database');
const {getHash, verifyFields, generateVerificationCode, isLegalPassword} = require('../common/common');
const fetch = require('node-fetch');

const {getImageLibrary}=require('../deviceServer');

const router = express.Router();
module.exports = router;


router.get('/list', [needKnex, authenticate.bind(null, 'member')], async (req, res) => {
    try {
        const devices = await req.knex('devices').select(['id as device_id', 'name']);
        res.json(devices);
    }catch(e){
        console.error('ERROR GET /devices/list', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/action', [needKnex, authenticate.bind(null, 'member')], async (req, res) => {
    try {
        res.status(200);
    }catch(e){
        console.error('ERROR GET /devices/list', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});