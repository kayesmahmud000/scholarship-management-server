require('dotenv').config()
const express = require('express');
const cors = require('cors');
const jwt= require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app= express()
const port= process.env.PORT || 5000


//middleware
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.crgmj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const scholarCollections= client.db('ScholarProDB').collection('scholarships')
    const usersCollections= client.db('ScholarProDB').collection('users')


    //jwt related api

    app.post('/jwt' , async(req, res)=>{
        const user =req.body
        const token= jwt.sign(user, process.env.SECRET_TOKEN, {expiresIn: '30d'})

        res.send({token})
    })

    // User related api

    app.get('/users', async(req , res)=>{
        const result= await usersCollections.find().toArray()
        res.send(result)
    })
    app.patch('/user/:email', async(req, res)=>{
        const email= req.params.email
        const filter= {email}
        const {role}= req.body
        const updateDoc={
            $set:{
                role
            }
        }
        const result= await usersCollections.updateOne(filter, updateDoc)
        res.send(result)
    })
    app.post('/users/:email', async(req,res)=>{
        const email= req.params.email
        const user= req.body
        const query = {email}
        const isExist= await usersCollections.findOne(query)
        if(isExist){
            return res.send(isExist)
        }
        const result= await usersCollections.insertOne({...user,
            role:'user',
            timeStamp: Date.now()
        })
        // console.log(user)
        res.send(result)
    })
    app.delete('/user/:id', async(req, res)=>{
        const id =req.params.id
        const query= {_id: new ObjectId(id)}
        const result = await usersCollections.deleteOne(query)
        res.send(result)
    })

    // Scholar related api
    app.get('/scholars', async(req, res)=>{
        const result= await scholarCollections.find().toArray()
        res.send(result)
    })

    app.get('/scholar/:id', async(req, res)=>{
        const id= req.params.id
        const query={_id:new ObjectId(id)}
        const result= await scholarCollections.findOne(query)
        res.send(result)
    })
    
    app.delete('/scholar/:id', async(req, res)=>{
        const id= req.params.id
        const query= {_id: new ObjectId(id)}
        const result= await scholarCollections.deleteOne(query)
        res.send(result)
    })
    
    app.put('/scholar/:id', async(req, res)=>{
        const id = req.params.id
        const filter= {_id: new ObjectId(id)}
        const {scholarshipName,
            universityName,
            universityCountry,
            universityCity,
            universityWorldRank,
            subjectCategory,
            scholarshipCategory,
            degree,
            tuitionFees,
            applicationFees,
            serviceCharge,
            applicationDeadline}= req.body
        const updateDoc= {
            $set:{
                scholarshipName,
                universityName,
                universityCountry,
                universityCity,
                universityWorldRank,
                subjectCategory,
                scholarshipCategory,
                degree,
                tuitionFees,
                applicationFees,
                serviceCharge,
                applicationDeadline
            }
        }

        const result= await scholarCollections.updateOne(filter, updateDoc)
        res.send(result)
    })
    app.post('/scholarship', async(req, res)=>{
        const scholarData= req.body
        console.log(scholarData)
        const result = await scholarCollections.insertOne(scholarData)
        res.send(result)
    })
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res)=>{
    res.send('Scholar Track server is running')
})

app.listen(port , ()=>{
    console.log(`Scholar Track server running on port : ${port} `)
})