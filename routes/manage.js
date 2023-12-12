const express = require('express');
const {authenticate} = require('../common/accessToken');


const router = express.Router();
module.exports = router;


router.get('/unverified', authenticate, async (req, res) => {
    try {
        const knex=getKnex();
        if (!knex) throw "database not connected";
        
        if (req.body.user.permissions.manage){            
            const [unverifiedUsers] = await knex('users').select('*').where({email});
        }else{
            res.sendStatus(403);//user doesnt have view permissions
        }
    }catch(e){
        res.sendStatus(404);
    }

});