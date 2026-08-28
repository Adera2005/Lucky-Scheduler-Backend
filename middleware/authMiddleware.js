const prisma = require('../prisma.js');
const jwt = require('jsonwebtoken');

const protect = async (req, res, next) => {
try{
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return res.status(401).json({
    status: 'fail',
    message: 'You are not logged in. Please log in to get access.',
  });
}
const token = authHeader.split(' ')[1];
const decoded = jwt.verify(token, process.env.JWT_SECRET);

const student = await prisma.student.findUnique({
  where: { id: decoded.id },
});

if (!student) {
  return res.status(401).json({
    status: 'fail',
    message: 'This account no longer exists.',
  });
}

req.student = student;
next();

}

catch(error){
console.error('Session Expired, kindly log in again',error.message);
res.status(401).json({status:'error',message:'Are you a Student?'});
}
};
module.exports = protect;