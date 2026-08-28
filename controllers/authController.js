const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma.js');

exports.signup = async(req,res)=>{
  try{
   const {name,email,password} = req.body;
   if(!name||!email||!password){
    return res.status(400).json({status:'fail',message:'Kindly enter all the details require: name,email,password'});
   }
   const existingStudent = await prisma.student.findUnique({
    where:{email},
});
 if(existingStudent){
   return res.status(400).json({status:'fail',message:'Sorry this email already exists try another one'});
 }
const hashedPassword = await bcrypt.hash(password,12);
const newStudent = await prisma.student.create({
    data:{
        name,
        email,
        password: hashedPassword,
    }
})
const token = jwt.sign(
    {id: newStudent.id},
    process.env.JWT_SECRET,
    {expiresIn: process.env.JWT_EXPIRES_IN}
);
res.status(201).json({
  status: 'success',
  message: 'Account Created Successfully.',
  token,
  data: {
    student: {
      id:    newStudent.id,
      name:  newStudent.name,
      email: newStudent.email,
    },
  },
});
  }
  catch(error){
     console.error('Signup Failed',error.message);
     res.status(500).json({status:'error',message:'An error occured in the creation of your account'});
  }
}
exports.login = async(req,res)=>{
  try{
    const {email,password} = req.body;
    if(!email || !password){
    return res.status(400).json({status:'fail',message:'Please enter both your email and password'})
    }
    const student = await prisma.student.findUnique({
      where: {email},
    });
    if(!student){
    return res.status(400).json({status:'fail',message:'Incorrect email or password:'})
    }
const passwordMatch = await bcrypt.compare(password, student.password);

if(!passwordMatch){
  return res.status(400).json({status:'fail',message:'Incorrect password please try again!'})

}

const token = jwt.sign(
    {id: student.id},
    process.env.JWT_SECRET,
    {expiresIn: process.env.JWT_EXPIRES_IN}
);

res.status(200).json({
  status: 'success',
  message: 'Log in Successfull.',
  token,
  data: {
    student: {
      id:    student.id,
      name:  student.name,
      email: student.email,
    },
  },
});
  }
  catch(error){
   console.error('Sorry Failed to Login in to your Account',error.message);
   res.status(500).json({status:'error',message:'An error occured during Log in'});
  }
}
