const { GoogleGenerativeAI } = require('@google/generative-ai');
exports.askGemini = async(req,res)=>{
    try{
   const {question,course} = req.body;
   if(!question || !course){
    return res.status(400).json({status:'fail',message:'Kindly enter your query and course'});
   }
   const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
   const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

  const prompt = `You are a helpful study assistant for university students.
The student is currently studying: ${course}.
Answer the following question clearly simply and with relevance to the question being asked.
Question: ${question}`;

const result = await model.generateContent(prompt);
const answer = result.response.text();
res.status(200).json({
    status:'success',
    message:'Query answered successfully',
    data:{
        question,
        answer,
        course

    }
})


    }
    catch(error){
    console.error('Gemini error:',error.message);
    res.status(500).json({
        status:'error',
        message:'Sorry Gemini was unable to respond',
    })
    }
}