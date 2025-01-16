require('dotenv').config()
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const app = express()
const port = process.env.PORT || 5000


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
        const scholarCollections = client.db('ScholarProDB').collection('scholarships')
        const usersCollections = client.db('ScholarProDB').collection('users')
        const applicationsCollections = client.db('ScholarProDB').collection('applications')


        //jwt related api

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.SECRET_TOKEN, { expiresIn: '30d' });
            res.send({ token });
        });

        // Middleware for Token Verification
        const verifyToken = (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'Unauthorized access' });
            }

            const token = authHeader.split(' ')[1];
            jwt.verify(token, process.env.SECRET_TOKEN, (err, decoded) => {
                if (err) {
                    return res.status(403).send({ message: 'Forbidden access' });
                }
                req.decoded = decoded;
                next();
            });
        };

        // Verify Admin or Moderator
        const verifyAdminAndModerator = async (req, res, next) => {
            const email = req.decoded?.email;
            const query = { email };
            const result = await usersCollections.findOne(query);
            if (!result || result.role === 'user') {
                return res.status(403).send({ message: "Forbidden! Admin and Moderator only." });
            }
            next();
        };

        // Verify Admin Only
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded?.email;
            const query = { email };
            const result = await usersCollections.findOne(query);
            if (!result || result.role !== 'admin') {
                return res.status(403).send({ message: "Forbidden! Admin only action." });
            }
            next();
        };


        // app.post('/jwt' , async(req, res)=>{
        //     const user =req.body
        //     const token= jwt.sign(user, process.env.SECRET_TOKEN, {expiresIn: '30d'})

        //     res.send({token})
        // })

        // // middleware

        // const verifyToken=async (req, res, next)=>{
        //     console.log('inside Verify token->' ,req.headers)
        //     if(!req?.headers?.authorization){
        //     return res.status(401).send({massage: 'Unauthorize access'})
        //     }
        //     const token= req.headers.authorization.split(' ')[1]
        //     jwt.verify(token, process.env.SECRET_TOKEN, (err, decoded)=>{
        //         if(err){
        //             return res.status(403).send({massage:'Forbidden access'})
        //         }
        //         req.decoded = decoded
        //         next()
        //     })
        // }

        // const verifyAdminAndModerator=async (req, res, next)=>{
        //    // console.log("data from verifyToken middleware", req.user)
        //    const email = req.user?.email
        //    const query = { email }
        //    const result = await usersCollections.findOne(query)
        //    if (!result || result.role === 'user') {
        //      return res.status(403).send({ massage: "Forbidden Access!, Admin And Moderator only action" })
        //    }
        //    next()
        // }

        // const verifyAdmin= async(req,res, next)=>{
        //     const email= req.user?.email
        //     const query={email}
        //     const result= await usersCollections.findOne(query)
        //     if(!result || result.role!== 'admin'){
        //         return res.status(403).send({massage: "Forbidden Access!, Admin only action"})
        //     }
        //     next()
        // }



        // User related api

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollections.find().toArray()
            res.send(result)
        })
        app.patch('/user/:email', verifyAdmin, async (req, res) => {
            const email = req.params.email
            const filter = { email }
            const { role } = req.body
            const updateDoc = {
                $set: {
                    role
                }
            }
            const result = await usersCollections.updateOne(filter, updateDoc)
            res.send(result)
        })
        app.post('/users/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const query = { email }
            const isExist = await usersCollections.findOne(query)
            if (isExist) {
                return res.send(isExist)
            }
            const result = await usersCollections.insertOne({
                ...user,
                role: 'user',
                timeStamp: Date.now()
            })
            // console.log(user)
            res.send(result)
        })
        app.delete('/user/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await usersCollections.deleteOne(query)
            res.send(result)
        })

        // role base api
        app.get('/user/role/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            const query = { email }
            const result = await usersCollections.findOne(query)
            res.send({ role: result?.role })


        })

        // Scholar related api
        app.get('/scholars', async (req, res) => {
            const result = await scholarCollections.find().toArray()
            res.send(result)
        })

        app.get('/scholar/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await scholarCollections.findOne(query)
            res.send(result)
        })

        app.delete('/scholar/:id', verifyToken, verifyAdminAndModerator, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await scholarCollections.deleteOne(query)
            res.send(result)
        })

        app.put('/scholar/:id', verifyToken, verifyAdminAndModerator, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const { scholarshipName,
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
                applicationDeadline } = req.body
            const updateDoc = {
                $set: {
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

            const result = await scholarCollections.updateOne(filter, updateDoc)
            res.send(result)
        })
        app.post('/scholarship', verifyToken, verifyAdminAndModerator, async (req, res) => {
            const scholarData = req.body
            console.log(scholarData)
            const result = await scholarCollections.insertOne(scholarData)
            res.send(result)
        })


        //application related Api


        app.get('/application/:email', async (req, res) => {
            const email = req.params.email;
            const query= {applicantEmail : email}
            console.log(email)
            const application= await applicationsCollections.findOne(query)
            // console.log(application)
            const scholarId= application?.scholarInfo?.scholarId
            console.log(scholarId)
            // const result = await applicationsCollections.aggregate([
            //     {
            //         $addFields: {
            //             "scholarInfo.scholarId": {
            //                 $toObjectId: "$scholarInfo.scholarId"
            //             }
            //         }
            //     },
            //     {
            //         $lookup: {
            //             from: 'scholarships',
            //             localField: 'scholarInfo.scholarId',
            //             foreignField: '_id',
            //             as: 'scholar'
            //         }
            //     },
            //     {
            //         $unwind: "$scholar"
            //     },
            //     {
            //         $project: {
            //             universityName: "$scholar.universityName",
            //             universityCountry: "$scholar.universityCountry", 
            //             applicationFeedback: "$applicationFeedback",   
            //             subjectCategory: "$scholar.subjectCategory",  
            //             appliedDegree: "$scholarInfo.degree",        
            //             applicationFees: "$scholar.applicationFees",  
            //             serviceCharge: "$scholar.serviceCharge",      
            //             applicationStatus: "$status"                
            //         }
            //     }
            // ]).toArray();
            
            const result = await applicationsCollections.aggregate([
                {
                    $addFields: {
                        "scholarInfo.scholarId": {
                            $toObjectId: "$scholarInfo.scholarId"
                        }
                    }
                },
                {
                    $lookup: {
                        from: 'scholarships',
                        localField: 'scholarInfo.scholarId',
                        foreignField: '_id',
                        as: 'scholar'
                    }
                },
                {
                    $unwind: {
                        path: "$scholar",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $addFields: {
                        "scholarInfo.universityName": "$scholar.universityName",
                        "scholarInfo.universityCountry": "$scholar.universityCountry",
                        "scholarInfo.universityCity": "$scholar.universityCity",
                        "scholarInfo.applicationFees": "$scholar.applicationFees",
                        "scholarInfo.serviceCharge": "$scholar.serviceCharge"
                    }
                },
                {
                    $project: {
                        scholar: 0 // Removing the full scholar object after extracting needed fields
                    }
                }
            ]).toArray();
            

            console.log(result)
            res.send(result)
        });

        app.post('/application', verifyToken, async (req, res) => {
            const application = req.body
            const applyEmail = application.applicantEmail
            const query = { email: applyEmail }
            const user = await usersCollections.findOne(query)
            console.log(applyEmail)
            console.log(user._id.toString())
            const result = await applicationsCollections.insertOne({ ...application, userId: user._id.toString() })
            res.send(result)
        })
        // create payment intent

        app.post('/create-payment-intent', verifyToken, async (req, res) => {
            const { applicationFee } = req.body
            const amount = parseInt(applicationFee * 100)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            })
            res.send({
                client_secret: paymentIntent.client_secret
            })
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


app.get('/', (req, res) => {
    res.send('Scholar Track server is running')
})

app.listen(port, () => {
    console.log(`Scholar Track server running on port : ${port} `)
})