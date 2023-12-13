const express = require('express');
const {authenticate} = require('../common/accessToken');
const { getKnex } = require('../database');


const router = express.Router();
module.exports = router;


router.get('/unverified', authenticate, async (req, res) => {
    try {
        const knex=getKnex();
        if (!knex) throw "database not connected";
        
        if (req.body.user.manage){            
            const [unverifiedUsers] = await knex('users').select(['users.id as user_id', 'users.email']).leftJoin('roles', 'users.role_id', 'roles.id').where({rolename: 'unverified'});
            res.send(unverifiedUsers);
        }else{
            res.sendStatus(403);//user doesnt have view permissions
        }
    }catch(e){
        res.sendStatus(404);
    }
});