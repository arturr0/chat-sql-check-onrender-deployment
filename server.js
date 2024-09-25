const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const uploadsDir = path.join(__dirname, 'uploads');  // Define uploadsDir here
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
//app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Serve static files from the uploads directory
//app.use('/uploads', express.static(uploadsDir));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const db = new sqlite3.Database('chat.db');
app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');


// Initialize multer with the defined storage


// Handle file upload route

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir); // Set the destination to 'uploads' directory
    },
    filename: function (req, file, cb) {
        const uniqueFileName = `uploaded_image_${Date.now()}_${file.originalname}`;
        cb(null, uniqueFileName);
    }
});
const upload = multer({ storage: storage });

// Handle file uploads
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    // Send the uploaded file path
    res.json({ filePath: `/uploads/${req.file.filename}` });
});

// Encryption/Decryption functions
const ENCRYPTION_KEY = crypto.randomBytes(32); // Generate a secure random 32-byte key
const IV_LENGTH = 16; // For AES, this is always 16

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// Initialize the SQLite database
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        socketId TEXT,
        receiver INTEGER,
        profileImage BLOB,
        FOREIGN KEY (receiver) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senderId INTEGER,
        recId INTEGER,
        message TEXT,
        read INTEGER NOT NULL,
        FOREIGN KEY (senderId) REFERENCES users(id),
        FOREIGN KEY (recId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS blocked (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        blocker INTEGER,
        blocked INTEGER,
        FOREIGN KEY (blocker) REFERENCES users(id),
        FOREIGN KEY (blocked) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inviting INTEGER,
        invited INTEGER,
        accepted INTEGER NOT NULL,
        FOREIGN KEY (inviting) REFERENCES users(id),
        FOREIGN KEY (invited) REFERENCES users(id)
    )`, (err) => {
        if (err) {
            console.error('Error creating friends table:', err);
        }
    });
});




// Serve the authorization page
app.get('/', (req, res) => {
    res.render('index');
});

// Serve the chat page (after authentication)
app.get('/chat', (req, res) => {
    const token = req.cookies.token;
    if (!token) {
        return res.redirect('/'); // Redirect to login if not authenticated
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.redirect('/'); // Redirect to login if token is invalid
        }
        res.render('chat'); // Render chat.pug for authenticated users
    });
});

// User registration
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ message: 'Server error' });

        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], function (err) {
            if (err) return res.status(500).json({ message: 'User already exists' });
            res.status(200).json({ message: 'User registered successfully' });
        });
    });
});

// User login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) return res.status(401).json({ message: 'Invalid username or password' });

        bcrypt.compare(password, user.password, (err, match) => {
            if (err || !match) return res.status(401).json({ message: 'Invalid username or password' });

            const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
            res.cookie('token', token, {
                httpOnly: true, 
                secure: true, 
                sameSite: 'None', // Explicitly set the SameSite attribute to 'None'
                maxAge: 3600000 // 1 hour in milliseconds
            });
            
            res.status(200).json({ message: 'Login successful' });
        });
    });
});

// Socket.IO handling
io.on('connection', (socket) => {
    //console.log('A user connected with socket ID:', socket.id);
    socket.on('typing', (isTyping, receiver) => {
        console.log(receiver);
        db.get('SELECT id FROM users WHERE socketId = ?', [socket.id], (err, sender) => {
            if (err || !sender) {
                console.error('Sender not found for socket:', socket.id);
                return;
            }
    
            // Find receiver's ID by username
            db.get('SELECT id, socketId FROM users WHERE username = ?', [receiver], (err, rec) => {
                if (err || !rec) {
                    console.error('Receiver not found:', receiver);
                    return;
                }
    
                
                io.to(rec.socketId).emit('userTyping', { isTyping, sender });
                
            });
        });
        
    });
    socket.on('login', (username) => {
        db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
            if (err || !user) {
                console.error('User not found:', username);
                return;
            }
    
            // Update the user's socket ID
            db.run('UPDATE users SET socketId = ? WHERE id = ?', [socket.id, user.id], (err) => {
                if (err) {
                    console.error('Error updating socket ID:', err);
                    return;
                }
                //console.log(`Socket ID ${socket.id} stored for user: ${username}`);
    
                // Now that the socket ID is updated, fetch the user again
                db.get('SELECT id FROM users WHERE socketId = ?', [socket.id], (err, updatedUser) => {
                    if (err || !updatedUser) {
                        console.error('Updated user not found:', err);
                        return;
                    }
    
                    // Query the friends table for any invitations where this user is invited
                    db.all('SELECT inviting FROM friends WHERE invited = ? AND accepted = 0', [updatedUser.id], (err, rows) => {
                        if (err) {
                            console.error('Error fetching invitations:', err);
                            return;
                        }
    
                        // If there are pending invitations, send them to the user
                        if (rows.length > 0) {
                            rows.forEach(row => {
                                //console.log("Found pending invitation");
                                // Optionally fetch the username of the inviting user
                                db.get('SELECT username FROM users WHERE id = ?', [row.inviting], (err, invitingUser) => {
                                    if (err) {
                                        console.error('Error fetching inviting user:', err);
                                        return;
                                    }
    
                                    // Emit the invitation to the invited user
                                    io.to(socket.id).emit('send invitation', {
                                        from: invitingUser.username,
                                        message: `You have received an invitation from ${invitingUser.username}.`,
                                        id: row.inviting // Send the inviting user's ID
                                    });
                                });
                            });
                        }
                    });
                });
            });
        });
    });
    

    // socket.on('chatMessage', ({ message }) => {
    //     db.get('SELECT id FROM users WHERE socketId = ?', [socket.id], (err, user) => {
    //         if (err || !user) {
    //             console.error('User not found for socket:', socket.id);
    //             return;
    //         }

    //         const encryptedMessage = encrypt(message);
    //         db.run('INSERT INTO messages (senderId, message) VALUES (?, ?)', [user.id, encryptedMessage], (err) => {
    //             if (err) {
    //                 console.error('Error saving message:', err);
    //                 return;
    //             }

    //             db.get('SELECT message FROM messages WHERE senderId = ? ORDER BY id DESC LIMIT 1', [user.id], (err, row) => {
    //                 if (err) {
    //                     console.error('Error retrieving message:', err);
    //                     return;
    //                 }

    //                 const decryptedMessage = decrypt(row.message);
    //                 io.to(socket.id).emit('message', { user: user.username, message: decryptedMessage });
    //             });
    //         });
    //     });
    // });
    socket.on('findUsers', async (searchUser) => {
        console.log("find");
        try {
            const founded = await findBlocked(searchUser, socket.id);
            socket.emit('foundUsers', founded);
        } catch (error) {
            console.error(error);
            socket.emit('searchError', { message: 'Failed to find users.' });
        }
    });
    
    socket.on('invite', async (invitedUser) => {
        console.log("console.log")
        try {
            const founded = await findBlocked(invitedUser, socket.id);
            //socket.emit('foundUsers', founded);
        } catch (error) {
            console.error(error);
            socket.emit('searchError', { message: 'Failed to find users.' });
        }
    
        // Find the ID and username of the user who is inviting
        db.get('SELECT id, username FROM users WHERE socketId = ?', [socket.id], (err, inviting) => {
            if (err || !inviting) {
                console.error('Inviting user not found:', err);
                return;
            }
    
            // Find the ID of the user being invited, along with their socketId
            db.get('SELECT id, socketId FROM users WHERE username = ?', [invitedUser], (err, invited) => {
                if (err || !invited) {
                    console.error('Invited user not found:', err);
                    return;
                }
    
                // Check if the invited user has blocked the inviting user
                db.get('SELECT * FROM blocked WHERE blocker = ? AND blocked = ?', [invited.id, inviting.id], (err, block) => {
                    if (err) {
                        console.error('Error checking block status:', err);
                        return;
                    }
    
                    if (block) {
                        //console.log(`Invitation not sent: ${inviting.username} is blocked by ${invited.username}`);
                        socket.emit('blockError', { message: 'You cannot send an invitation to this user.' });
                        return; // Exit if blocked
                    }
    
                    // Insert into the friends table with accepted set to 0
                    db.run('INSERT INTO friends (inviting, invited, accepted) VALUES (?, ?, 0)', [inviting.id, invited.id], (err) => {
                        if (err) {
                            console.error('Error inserting into friends table:', err);
                        } else {
                            //console.log(`User ${inviting.id} invited ${invited.id}`);
    
                            // Send invitation to the invited user using their socketId
                            if (invited.socketId) {
                                io.to(invited.socketId).emit('send invitation', {
                                    from: inviting.username,
                                    id: inviting.id,
                                    message: `You have received an invitation from user ${inviting.username}.`
                                });
                            } else {
                                console.error('Invited user does not have a valid socketId.');
                            }
    
                            // Emit a custom event to signal that the invite is processed
                            socket.emit('inviteProcessed');
                        }
                    });
                });
            });
        });
    });
    
    
    socket.on('confirm invite', ({ decision, invitingId }) => {
        // Find the ID of the invited user based on the socket ID
        db.get('SELECT id FROM users WHERE socketId = ?', [socket.id], (err, invited) => {
            if (err || !invited) {
                console.error('Invited user not found:', err);
                return;
            }
    
            if (decision) {
                // Update accepted to 1
                db.run('UPDATE friends SET accepted = 1 WHERE inviting = ? AND invited = ?', [invitingId, invited.id], (err) => {
                    if (err) {
                        console.error('Error updating friends table:', err);
                    } else {
                        //console.log(`Invitation accepted by user ${invited.id}`);
                    }
                });
            } else {
                // Remove the row if not accepted
                db.run('DELETE FROM friends WHERE inviting = ? AND invited = ?', [invitingId, invited.id], (err) => {
                    if (err) {
                        console.error('Error deleting from friends table:', err);
                    } else {
                        //console.log(`Invitation rejected by user ${invited.id}`);
                    }
                });
            }
        });
    });
    
    socket.on('receiver', (receiver) => {
        const currentSocketId = socket.id;
    
        // Find the sender (current user) based on the socket ID
        db.get(`SELECT id FROM users WHERE socketId = ?`, [currentSocketId], (err, senderRow) => {
            if (err || !senderRow) {
                console.error('Error finding sender:', err);
                return;
            }
    
            const senderId = senderRow.id;
    
            // Find the receiver's ID based on the receiver's username
            db.get(`SELECT id FROM users WHERE username = ?`, [receiver], (err, receiverRow) => {
                if (err || !receiverRow) {
                    console.error('Error finding receiver:', err);
                    return;
                }
    
                const receiverId = receiverRow.id;
    
                // Update the sender's receiver field
                db.run(`UPDATE users SET receiver = ? WHERE id = ?`, [receiverId, senderId], (err) => {
                    if (err) {
                        console.error('Error updating receiver for sender:', err);
                    } else {
                        console.log('Receiver set successfully for sender with socketId:', currentSocketId);
                    }
                });
            });
        });
    });
    // socket.on('message', function(message) {
    //     // Save the binary data to a file
    //     fs.writeFile('uploaded_image.jpg', message, function(err) {
    //         if (err) throw err;
    //         console.log('The image has been saved!');
    
    //         // Broadcast the image to all users
    //         io.emit('newImage', message);  // Emit with 'newImage' event
    //     });
    // });
    socket.on('message', function(message) {
        // Generate a unique file name
        const uniqueFileName = `uploaded_image_${socket.id}_${Date.now()}.jpg`;
        const filePath = path.join(uploadsDir, uniqueFileName);  // Save in uploads directory

        // Save the binary data to a file
        fs.writeFile(filePath, message, function(err) {
            if (err) {
                console.error('Error saving the image:', err);
                return;
            }
            console.log('The image has been saved as:', uniqueFileName);

            // Retrieve the user ID based on the socket ID
            db.get(`SELECT id FROM users WHERE socketId = ?`, [socket.id], (err, row) => {
                if (err) {
                    console.error('Error fetching user ID:', err);
                    return;
                }
                if (row) {
                    const userId = row.id;

                    // Store the image path in the user's profileImage field
                    db.run(`UPDATE users SET profileImage = ? WHERE id = ?`, [filePath, userId], (err) => {
                        if (err) {
                            console.error('Error updating user profile image:', err);
                        } else {
                            console.log('Profile image updated for user ID:', userId);
                        }

                        // Broadcast the image to all users
                        io.emit('newImage', message);
                    });
                }
            });
        });
    });

     
    socket.on('uploadImage', (imageData) => {
    const uniqueFileName = `uploaded_image_${socket.id}_${Date.now()}.jpg`;
    const filePath = path.join(uploadsDir, uniqueFileName); 

    // Save the binary image data to a file
    fs.writeFile(filePath, imageData, 'binary', (err) => {
        if (err) {
            console.error('Error saving the image:', err);
            return;
        }
        console.log('Image saved successfully:', filePath);

        // Update user's profile image in the database
        db.run(`UPDATE users SET profileImage = ? WHERE socketId = ?`, [filePath, socket.id], (err) => {
            if (err) {
                console.error('Error updating profile image:', err);
                return;
            }

            // Broadcast the new image to all users
            io.emit('newImage', filePath);
        });
    });
});

    socket.on('block', (blockedUsername, callback) => {
        // Find the ID of the user who is blocking
        db.get('SELECT id FROM users WHERE socketId = ?', [socket.id], (err, blocker) => {
            if (err || !blocker) {
                console.error('Blocker not found:', err);
                return callback({ success: false, error: 'Blocker not found' });
            }
    
            // Find the ID of the user being blocked
            db.get('SELECT id FROM users WHERE username = ?', [blockedUsername], (err, blocked) => {
                if (err || !blocked) {
                    console.error('Blocked user not found:', err);
                    return callback({ success: false, error: 'Blocked user not found' });
                }
    
                // Insert into the blocked table
                db.run('INSERT INTO blocked (blocker, blocked) VALUES (?, ?)', [blocker.id, blocked.id], function(err) {
                    if (err) {
                        console.error('Error inserting into blocked table:', err);
                        return callback({ success: false, error: 'Database error' });
                    }
    
                    // Remove the friendship if it exists
                    db.run('DELETE FROM friends WHERE (inviting = ? AND invited = ?) OR (inviting = ? AND invited = ?)', 
                        [blocker.id, blocked.id, blocked.id, blocker.id], (err) => {
                        if (err) {
                            console.error('Error removing friendship:', err);
                            return callback({ success: false, error: 'Database error' });
                        }
                    });
    
                    // Notify the client about the successful block and invoke the callback
                    callback({ success: true, message: `You have blocked ${blockedUsername}` });
                });
            });
        });
    });
    
    
    
    
    
    

    socket.on('disconnect', () => {
        // Update both socketId and receiver to NULL when a user disconnects
        db.run('UPDATE users SET socketId = NULL, receiver = NULL WHERE socketId = ?', [socket.id], (err) => {
            if (err) {
                console.error('Error clearing socket ID and receiver:', err);
            }
        });
    });
    
    function findBlocked(searchUser, socketId) {
        return new Promise((resolve, reject) => {
            // Find the sender by their socket ID
            db.get('SELECT id FROM users WHERE socketId = ?', [socketId], (err, sender) => {
                if (err || !sender) {
                    console.error('Sender not found:', err);
                    return reject(err);
                }
    
                // SQL query to find users excluding the sender and those they have blocked, and adding isFriend status
                const query = `
                    SELECT u.id, u.username, u.socketId, u.profileImage,  -- Include profileImage
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM friends
                            WHERE (friends.inviting = u.id AND friends.invited = ?)  -- Sender is invited
                            OR (friends.invited = u.id AND friends.inviting = ?)     -- Sender is inviting
                        ) THEN 1
                        ELSE 0
                    END AS isFriend
                    FROM users u
                    WHERE u.username LIKE ? COLLATE NOCASE  -- 3rd placeholder
                    AND u.id != ?  -- Exclude the sender themselves
                    AND u.id NOT IN (
                        -- Exclude users who have blocked the sender
                        SELECT blocker FROM blocked WHERE blocked = ?  -- 4th placeholder
                    )
                    AND u.id NOT IN (
                        -- Exclude users blocked by the sender
                        SELECT blocked FROM blocked WHERE blocker = ?  -- 5th placeholder
                    );
                `;
    
                // Execute the query
                db.all(query, [`${sender.id}`, `${sender.id}`, `%${searchUser}%`, sender.id, sender.id, sender.id], (err, rows) => {
                    if (err) {
                        console.error(err);
                        return reject(err);
                    }
    
                    // Map through rows to add image file names
                    const modifiedRows = rows.map(row => {
                        const fileName = row.profileImage ? row.profileImage.split('\\').pop() : 'default.jpg'; // Extract filename or use default
                        return {
                            ...row, // Spread original row properties
                            profileImage: fileName // Replace profileImage with just the filename
                        };
                    });
    
                    resolve(modifiedRows);  // Resolve with the modified rows including filenames
                });
            });
        });
    }
    
    
    
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    //console.log(`Server is listening on port ${PORT}`);
});

