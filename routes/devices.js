const express = require('express');
const {authenticate} = require('../common/accessToken');
const { needKnex } = require('../database');
const {getHash, verifyFields, generateVerificationCode, isLegalPassword} = require('../common/common');
const fetch = require('node-fetch');

const {DeviceIO}=require('../deviceServer');

const router = express.Router();
module.exports = router;


router.get('/list', [needKnex, authenticate.bind(null, 'member')], async (req, res) => {
    try {
        let devices;
        if (req.user.role==='admin' || req.user.role==='super'){
            devices = await req.knex('devices').select(['id as device_id', 'name', 'encro_key']);
        }else{
            devices = await req.knex('devices').select(['id as device_id', 'name']);
        }
        const connectedDevices=DeviceIO.getDevices();
        for (const connectedDevice of connectedDevices){
            for (const device of devices){
                if (connectedDevice.name===device.name){
                    device.connected=true;
                    break;
                }
            }
        }
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
        console.error('ERROR POST /devices/action', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/add', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try {
        res.status(200);
    }catch(e){
        console.error('ERROR POST /devices/add', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/update', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try {
        res.status(200);
    }catch(e){
        console.error('ERROR POST /devices/update', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/delete', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try {
        res.status(200);
    }catch(e){
        console.error('ERROR POST /devices/delete', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});