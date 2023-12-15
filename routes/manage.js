const express = require('express');
const {verifyFields} = require('../common/common');
const {authenticate, isHigherRanked} = require('../common/accessToken');
const { needKnex } = require('../database');


const router = express.Router();
module.exports = router;


router.get('/users/:roleFilter?', [needKnex, authenticate.bind(null, 'manager')], async (req, res) => {
    try {
        const [fieldCheck, roleFilter] = verifyFields(req.params, ['roleFilter:~super,admin,manager,member,unverified:?']);
        if (fieldCheck) return res.status(400).json('failed field check: '+fieldCheck);

        let users=[];
        if (req.user.role==='super'){
            users = await req.knex('users').select(['id as user_id', 'email', 'role']);
        }else if (req.user.role==='admin'){
            users = await req.knex('users').select(['id as user_id', 'email', 'role']).whereNotIn('role', ['admin', 'super']);
        }else if (req.user.role==='manager'){
            users = await req.knex('users').select(['id as user_id', 'email', 'role']).whereNotIn('role', ['admin', 'super', 'manager']);
        }
        if (roleFilter){
            users=users.filter(u=>u.role===roleFilter);
        }
        res.send(users);
    }catch(e){
        console.error('ERROR GET /manage/users', req.body, e);
        res.sendStatus(400);
    }
});

router.post('/user/role', [needKnex, authenticate.bind(null, 'manager')], async (req, res) => {
    try {
        const [fieldCheck, newRole, user_id] = verifyFields(req.body, ['new_role:~super,admin,manager,member,unverified', 'user_id:number']);
        if (fieldCheck) return res.status(400).json('failed field check: '+fieldCheck);

        const [{role: oldRole}] = await req.knex('users').select('role').where({id: user_id});

        if ((isHigherRanked(req.user.role, oldRole) && isHigherRanked(req.user.role, newRole)) || req.user.role==='super'){
            const [updatedUser] = await req.knex('users').update({role: newRole}).where({id: user_id}).returning(['id as user_id', 'email', 'role']);
            return res.status(200).json(updatedUser);
        }
        return res.sendStatus(403);

    }catch(e){
        console.error('ERROR POST /manage/user/role', req.body, e);
        res.sendStatus(400);
    }
});