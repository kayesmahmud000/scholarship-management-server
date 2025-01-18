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
        const reviewCollections = client.db('ScholarProDB').collection('reviews')


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



        // User related api

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollections.find().toArray()
            res.send(result)
        })
        app.patch('/user/:email', verifyToken, verifyAdmin, async (req, res) => {
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
            const { search, page, limit } = req.query;
            const pageInt = parseInt(page) || 0; // Default to 0 if not provided
            const limitInt = parseInt(limit) || 10; // Default to 10 if not provided

            const searchQuery = search
                ? {
                    $or: [
                        { scholarshipName: { $regex: search, $options: 'i' } },
                        { universityName: { $regex: search, $options: 'i' } },
                        { degree: { $regex: search, $options: 'i' } },
                    ],
                }
                : {};

            try {
                // Count the total number of matching documents
                const totalCount = await scholarCollections.countDocuments(searchQuery);

                // Fetch the paginated results
                const result = await scholarCollections
                    .aggregate([
                        {
                            $match: searchQuery,
                        },
                        {
                            $addFields: {
                                universityIdString: { $toString: '$_id' }, // Convert _id to string for matching
                            },
                        },
                        {
                            $lookup: {
                                from: 'reviews',
                                localField: 'universityIdString',
                                foreignField: 'universityId', // Match the universityId
                                as: 'reviews',
                            },
                        },
                        {
                            $addFields: {
                                averageRating: {
                                    $cond: {
                                        if: { $gt: [{ $size: '$reviews' }, 0] },
                                        then: { $avg: '$reviews.rating' },
                                        else: 0,
                                    },
                                },
                            },
                        },
                        {
                            $project: {
                                scholarshipName: 1,
                                degree: 1,
                                universityName: 1,
                                universityLogo: 1,
                                universityWorldRank: 1,
                                scholarshipCategory: 1,
                                universityCountry: 1,
                                universityCity: 1,
                                applicationDeadline: 1,
                                subjectCategory: 1,
                                applicationFees: 1,
                                averageRating: { $round: ['$averageRating', 1] }, // Round rating to 1 decimal
                            },
                        },
                        {
                            $skip: pageInt * limitInt, // Skip documents for pagination
                        },
                        {
                            $limit: limitInt, // Limit the number of documents
                        },
                    ])
                    .toArray();

                // Send the results and the total count
                res.send({
                    data: result,
                    totalCount, // Total matching documents
                    totalPages: Math.ceil(totalCount / limitInt), // Total pages
                    currentPage: pageInt + 1, // Current page (adjusted for 1-based indexing)
                });
            } catch (error) {
                console.error('Error fetching scholars:', error);
                res.status(500).send({ error: 'Failed to fetch scholars with ratings' });
            }
        });
        app.get('/all-scholar', verifyToken, verifyAdminAndModerator, async (req, res) => {
            const result = await scholarCollections.find().toArray()
            res.send(result)
        })

       
        app.get('/latest-scholar', async (req, res) => {
            const result = await scholarCollections.aggregate([
                {
                    $addFields: {
                        universityIdString: { $toString: "$_id" }  // Convert _id to string for matching
                    }
                },
                {
                    $lookup: {
                        from: 'reviews',
                        localField: 'universityIdString',
                        foreignField: 'universityId',  // Match the universityId
                        as: 'reviews'
                    }
                },
                {
                    $addFields: {
                        averageRating: {
                            $cond: {
                                if: { $gt: [{ $size: "$reviews" }, 0] },
                                then: { $avg: "$reviews.rating" },
                                else: 0
                            }
                        }
                    }
                },
                {
                    $project: {
                        scholarshipName: 1,
                        degree: 1,
                        universityName: 1,
                        universityLogo: 1,
                        universityWorldRank: 1,
                        scholarshipCategory: 1,
                        universityCountry: 1,
                        universityCity: 1,
                        applicationDeadline: 1,
                        subjectCategory: 1,
                        applicationFees: 1,
                        averageRating: { $round: ["$averageRating", 1] }
                    }
                },
                {
                    $sort: { applicationFees: 1, _id: -1 }
                },
                {
                    $limit: 6
                }
            ]).toArray()
            res.send(result)
        })
        app.get('/scholar/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const result = await scholarCollections.aggregate([
                {
                    $match: { _id: new ObjectId(id) }
                },
                {
                    $lookup: {
                        from: 'reviews',
                        let: { scholarshipId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: [
                                            { $toObjectId: "$universityId" },
                                            "$$scholarshipId"
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    reviewerImage: "$userPhoto",
                                    reviewerName: "$userName",
                                    reviewDate: "$reviewDate",
                                    ratingPoint: "$rating",
                                    reviewerComments: "$comment"
                                }
                            }
                        ],
                        as: 'reviews'
                    }
                }
            ]).toArray();
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
        app.get('/applications', verifyToken, verifyAdminAndModerator, async (req, res) => {
            const result = await applicationsCollections.find().toArray()
            res.send(result)
        })

        app.get('/application/:email', verifyToken, async (req, res) => {
            try {
                const email = req.params.email;
                const query = { applicantEmail: email };

                // Using aggregate directly instead of findOne
                const result = await applicationsCollections.aggregate([
                    {
                        $match: query // Matching all applications for the provided email
                    },
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

                res.send(result);
            } catch (error) {
                console.error("Error fetching applications:", error);
                res.status(500).send({ message: "Error fetching applications" });
            }
        });

        app.delete('/application/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await applicationsCollections.deleteOne(query)
            res.send(result)
        })
        app.post('/application', verifyToken, async (req, res) => {
            const application = req.body
            const applyEmail = application.applicantEmail
            const query = { email: applyEmail }
            const user = await usersCollections.findOne(query)
            // console.log(applyEmail)
            // console.log(user._id.toString())
            const result = await applicationsCollections.insertOne({ ...application, userId: user._id.toString() })
            res.send(result)
        })
        app.patch('/application/new-status/:id', verifyToken, verifyAdminAndModerator, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const { status } = req.body
            const updateDoc = {
                $set: {
                    status
                }
            }
            const result = await applicationsCollections.updateOne(filter, updateDoc)
            res.send(result)
        })
        app.patch('/application/:id', verifyToken, verifyAdminAndModerator, async (req, res) => {
            const id = req.params.id
            const { feedback } = req.body
            const filter = { _id: new ObjectId(id) }
            const option = { upset: true }
            const updateDoc = {
                $set: {
                    feedback
                }
            }
            const result = await applicationsCollections.updateOne(filter, updateDoc, option)
            console.log(result)
            res.send(result)

        })
        app.patch('/application/status/:id', verifyToken, verifyAdminAndModerator, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const { status } = req.body
            const updateDoc = {
                $set: {
                    status
                }
            }
            const result = await applicationsCollections.updateOne(filter, updateDoc)
            res.send(result)
        })
        app.put('/application/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const { phoneNumber, applicantName, applicantEmail, village, district,
                country, gender, hscResult, studyGap, sscResult } = req.body
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    phoneNumber, applicantName, applicantEmail, village, district,
                    country, gender, hscResult, studyGap, sscResult
                }
            }
            const result = await applicationsCollections.updateOne(filter, updateDoc)
            res.send(result)
        })
        app.get('/applications/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await applicationsCollections.findOne(query)
            console.log(result)
            res.send(result)
        })


        // review related api
        app.get('/reviews', verifyToken, verifyAdminAndModerator, async (req, res) => {
            const result = await reviewCollections.aggregate([
                {
                    $addFields: {
                        ObjectUniversityId: { $toObjectId: "$universityId" }
                    }
                },
                {
                    $lookup: {
                        from: "scholarships",
                        localField: "ObjectUniversityId",
                        foreignField: "_id",
                        as: 'scholars'

                    }
                },
                {
                    $unwind: '$scholars'
                },
                {
                    $addFields: {
                        subjectCategory: '$scholars.subjectCategory'
                    }
                },
                {
                    $project: {
                        scholars: 0,
                        ObjectUniversityId: 0

                    }
                }

            ]).toArray()
            res.send(result)
        })
        app.get('/review/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            const query = { userEmail: email }

            const result = await reviewCollections.find(query).toArray()
            res.send(result)
        })
        app.post('/review', verifyToken, async (req, res) => {
            const review = req.body
            const result = await reviewCollections.insertOne(review)
            res.send(result)
        })

        app.put('/review/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const { rating, comment, userName, userEmail, } = req.body
            const updateDoc = {
                $set: {
                    rating, comment, userName, userEmail,
                }
            }
            const result = await reviewCollections.updateOne(filter, updateDoc)
            res.send(result)
        })
        app.delete('/review/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await reviewCollections.deleteOne(query)
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