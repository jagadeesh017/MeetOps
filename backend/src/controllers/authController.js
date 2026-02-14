const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Employee = require('../models/employee');
exports.login = async(req,res) =>{
     const {name, email, password} = req.body;
     try{
           const user = await Employee.findOne({email});
           if(!user){
            return res.status(400).json({message:"User not found"});
           }
           const isMatch = await bcrypt.compare(password,user.password);
           if(!isMatch){
               return res.status(400).json({message:"Invalid credentials"});
               
     }
       const token = jwt.sign({id:user._id}, process.env.JWT_SECRET, {expiresIn:"1h"});

       res.json({token});

     }catch(err){
        console.error(err.message);
        res.status(500).json({message:"Server error"});
     }
};