const express = require('express');
const {authenticate} = require('../common/accessToken');


const router = express.Router();
module.exports = router;

//Do i need this? trying to get protect against ../../../../../ attacks
function isValidFile(str){
    for (let i=0;i<str.length-1;i++){
        if (str[i]==='.' && str[i+1]==='.') return false;
    }
    return true;
}

router.get('/:file', authenticate, (req, res) => {
    try {
        if (!isValidFile(req.params.file)){
            res.sendStatus(404);
        }else{
            if (req.body.user.permissions.view){
                res.sendFile(process.env.CAM_DIR + req.params.file);
            }else{
                res.sendStatus(403);//user doesnt have view permissions
            }
        }
    } catch (e){
        res.sendStatus(404);
    }
});