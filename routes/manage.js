const express = require('express');
const {authenticate} = require('../common/accessToken');
const { needKnex } = require('../database');


const router = express.Router();
module.exports = router;


router.get('/unverified', [needKnex, authenticate.bind(null, {manage: true})], async (req, res) => {
    try {
        const unverifiedUsers = await req.knex('users').select(['users.id as user_id', 'users.email']).leftJoin('roles', 'users.role_id', 'roles.id').where({rolename: 'unverified'});
        res.send(unverifiedUsers);
    }catch(e){
        res.sendStatus(404);
    }
});


router.get('/users', [needKnex, authenticate.bind(null, {manage: true})], async (req, res) => {
    try {
        let users;
        if (req.body.user.admin){
            users = await req.knex('users').select(['users.id as user_id', 'users.email']);
        }else{
            users = await req.knex('users').select(['users.id as user_id', 'users.email']).leftJoin('roles', 'users.role_id', 'roles.id').where({admin: false});
        }
        res.send(users);
    }catch(e){
        res.sendStatus(404);
    }
});