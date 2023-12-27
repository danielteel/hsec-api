const express = require('express');
const {verifyFields} = require('../common/common');
const {authenticate, isHigherRanked} = require('../common/accessToken');
const { needKnex } = require('../database');


const router = express.Router();
module.exports = router;


router.get('/users/:roleFilter?', [needKnex, authenticate.bind(null, 'manager')], async (req, res) => {
    try {
        const [fieldCheck, roleFilter] = verifyFields(req.params, ['roleFilter:~super,admin,manager,member,unverified:?']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

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
        res.json(users);
    }catch(e){
        console.error('ERROR GET /manage/users', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/user/role', [needKnex, authenticate.bind(null, 'manager')], async (req, res) => {
    try {
        const [fieldCheck, newRole, userId] = verifyFields(req.body, ['newRole:~super,admin,manager,member,unverified', 'userId:number']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        const [{role: oldRole}] = await req.knex('users').select('role').where({id: userId});

        if ((isHigherRanked(req.user.role, oldRole) && isHigherRanked(req.user.role, newRole)) || req.user.role==='super'){
            const [updatedUser] = await req.knex('users').update({role: newRole}).where({id: userId}).returning(['id as user_id', 'email', 'role']);
            return res.status(200).json(updatedUser);
        }
        return res.status(403).json({error: 'insufficent privileges'});

    }catch(e){
        console.error('ERROR POST /manage/user/role', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/user/email', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try {
        const [fieldCheck, newEmail, userId] = verifyFields(req.body, ['newEmail:string:*:lt', 'userId:number']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        const [{role}] = await req.knex('users').select('role').where({id: userId});
   
        if (req.user.role==='admin' && (role==='super' || role==='admin')){
                return res.status(403).json({error: 'insufficent privileges'});
        }
        const [updatedUser] = await req.knex('users').update({email: newEmail}).where({id: userId}).returning(['id as user_id', 'email', 'role']);
        return res.status(200).json(updatedUser);

    }catch(e){
        console.error('ERROR POST /manage/user/email', req.body, e);
        return res.status(400).json({error: 'error'});
    }
})