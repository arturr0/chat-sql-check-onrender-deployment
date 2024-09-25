const socket = io.connect('https://chat-sql-check-onrender-deployment.onrender.com');
const baseUrl = window.location.origin;
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const optionsButton = document.getElementById('optionsButton');
    const options = document.getElementById('options');
    if (document.getElementById("message")) {
        document.getElementById("message").addEventListener("keydown", function(e) {
            let messageSent = document.getElementById("message").value;
            const inputValString = String(messageSent);
            
            if (e.key === 'Enter') {
                e.preventDefault();
                if (messageSent !== null && messageSent.trim() !== '') {
                    const chat = document.getElementById("chat");
                    //const receiver = 'art2';
                    
                    chat.innerHTML += (`<div class="bubble left" style="word-break: break-word">${inputValString}</div>`);
                    adjustMarginForScrollbar();
                    const username = localStorage.getItem('username');
                    console.log(username);
                    socket.emit('chatMessage', { username, messageSent, receiver });
                    document.getElementById("message").value = "";
                    console.log(messageSent);
                    jQuery("#chat").scrollTop(jQuery("#chat")[0].scrollHeight);
                }
            }
        });
    }
    optionsButton.addEventListener('click', () => {
        if (options.classList.contains('animate')) {
            // Hide the div
            options.classList.remove('animate');
            options.addEventListener('transitionend', () => {
                options.style.visibility = 'hidden'; // Hide after animation ends
            }, { once: true });
        } else {
            // Show the div
            options.style.visibility = 'visible'; // Ensure it is visible
            // Trigger reflow
            void options.offsetWidth; // Forces reflow to apply animation
            // Start animation
            options.classList.add('animate');
        }
    });
    socket.on('connect', () => {
        const username = localStorage.getItem('username');
        socket.emit('login', username);
        console.log('Username emitted to server:', username);
    });

    const messages = document.getElementById('messages');
    const formMessage = document.getElementById('chat-form');
    const inputMessage = document.getElementById('message');


// Update the receiver variable when the input changes
// receivers.addEventListener('input', () => {
//     receiver = receivers.value.trim(); // Update on input change
//     console.log('Updated receiver:', receiver);
// });

// formMessage.addEventListener('submit', (e) => {
//     e.preventDefault();
//     const message = inputMessage.value.trim();
//     const user = localStorage.getItem('username');
    
//     // Log the receiver and message
//     if (!message || !receiver) {
//         console.log('Message or receiver is missing');
//         return;  // Exit if either the message or receiver is empty
//     }
    
//     console.log('Submitting message:', receiver, message); // Log the receiver and message if valid
    
//     socket.emit('chatMessage', { user, message, receiver });
//     inputMessage.value = ''; // Clear the message input after sending
// });



    const usersDiv = document.getElementById('users');
    let searchUser = 'p';

    searchInput.addEventListener('input', () => {
        searchUser = searchInput.value.trim();
        if (searchUser) {
            console.log('Input search user:', searchUser);
            socket.emit('findUsers', searchUser);
        } else {
            usersDiv.innerHTML = '';
        }
    });

    socket.on('foundUsers', (founded) => {
        console.log('Found users:', founded);
        
        // Clear previous user list
        const fragment = document.createDocumentFragment();
        usersDiv.innerHTML = ''; // Clear before appending
        
        founded.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.classList.add('user');
            console.log(user)
            // Create and append the image element
            const userImage = document.createElement('img');
            userImage.src = `chat-sql-check-onrender-deployment.onrender.com/uploads/${user.profileImage}`|| 'path/to/default/image.jpg';  // Use a default image if none
            userImage.alt = `${user.username}'s profile image`;
            userImage.classList.add('profile-image');  // Add a class for styling (optional)
            document.getElementById("menu").appendChild(userImage);
            // Append image to userDiv
            userDiv.appendChild(userImage);
            console.log(userImage)
            // Append username to userDiv
            userDiv.appendChild(document.createTextNode(user.username));
            
            // Create and append the invite button
            const inviteButton = document.createElement('button');
            inviteButton.classList.add('send');
            inviteButton.setAttribute('value', user.username);
    
            // Add the Fontello icon
            const iconInvite = document.createElement('i');
            iconInvite.classList.add('icon-user-plus');  // Replace 'icon-class' with the specific class from Fontello
            inviteButton.appendChild(iconInvite);
            
            inviteButton.addEventListener('click', () => {
                const invitedUser = inviteButton.value;
                console.log('Inviting user:', invitedUser); 
                inviteButton.disabled = true; // Disable button to prevent multiple invites
                socket.emit('invite', invitedUser);
    
                // Reset the user list and then re-fetch after processing the invite
                socket.once('inviteProcessed', () => {
                    socket.emit('findUsers', searchUser);
                    console.log('Find users after invite:', searchUser);
                });
            });
            
            userDiv.appendChild(inviteButton);  // Append invite button
    
            // Create and append the send button
            const sendButton = document.createElement('button');
            sendButton.classList.add('send');
            sendButton.setAttribute('value', user.username);
    
            // Add the Fontello icon
            const iconSend = document.createElement('i');
            iconSend.classList.add('icon-mail');  // Replace 'icon-class' with the specific class from Fontello
            sendButton.appendChild(iconSend);
            userDiv.appendChild(sendButton);  // Append send button
    
            sendButton.addEventListener('click', () => {
                receiver = sendButton.value;
                socket.emit('receiver', receiver);
            });
    
            // Create and append the block button
            const blockButton = document.createElement('button');
            blockButton.classList.add('send');
            blockButton.setAttribute('value', user.username);
    
            // Add the Fontello icon
            const iconBlock = document.createElement('i');
            iconBlock.classList.add('icon-user-times');  // Replace 'icon-class' with the specific class from Fontello
            blockButton.appendChild(iconBlock);
            userDiv.appendChild(blockButton);  // Append block button
    
            blockButton.addEventListener('click', () => {
                const blockedUser = blockButton.value;
                socket.emit('block', blockedUser, (response) => {
                    if (response.success) {
                        socket.emit('findUsers', searchUser);
                        console.log(response.message);
                    } else {
                        console.error('Failed to block user:', response.error);
                    }
                });
            });
    
            // Append the invite button only if the user is not a friend
            if (user.isFriend != 1) userDiv.appendChild(inviteButton);
    
            // Append the userDiv to the document fragment
            fragment.appendChild(userDiv);
        });
    
        // Append the entire fragment to the usersDiv
        usersDiv.appendChild(fragment);
        console.log('Users appended:', usersDiv.innerHTML);
    });
    
    socket.on('message', (data) => {
        console.log(data);
        adjustMarginForScrollbar()
        const messRec = String(data.message);
        const chat = document.getElementById("chat");

        chat.innerHTML += (`<div class="bubble right" style="word-break: break-word">${data.message}</div>`);
        jQuery("#chat").scrollTop(jQuery("#chat")[0].scrollHeight);
    });
    socket.on('send invitation', (data) => {
        console.log('Invitation data received:', data);
        // const userConfirmed = confirm(`${data.from} wants to be your friend. Do you accept?`);
        // const inviteDecision = userConfirmed ? true : false;
        // socket.emit('confirm invite', { decision: inviteDecision, invitingId: data.id });
    });
    const messageInput = document.getElementById('message');
const typingIndicator = document.getElementById('typingIndicator');
//const receivers = document.getElementById('rec'); // Receiver's input element
let receiver = ''; // Global receiver variable

// receivers.addEventListener('input', () => {
//     receiver = receivers.value.trim(); // Update receiver when the input changes
// });
    const fileInput = document.querySelector('#fileInput');

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        console.log('File uploaded:', data.filePath);
        socket.emit('uploadImage', data.filePath);  // Emit the file path through WebSocket
    })
    .catch(err => console.error('Error uploading file:', err));
});

    // Listening for the new image event
socket.on('newImage', function(data) {
    // Create a Blob from the received image data
    const blob = new Blob([data], { type: 'image/jpeg' }); // Set the correct MIME type
    const imageUrl = URL.createObjectURL(blob);

    // Create an image element and set its source
    const img = document.createElement('img');
    img.src = imageUrl;

    // Optionally, you can style or set attributes for the image
    img.style.maxWidth = '100%'; // Example styling
    img.style.height = 'auto';

    // Append the image to the desired container in your chat interface
    document.getElementById("menu").appendChild(img);
});


    let typingTimer;
    const typingDelay = 2000; // 2 seconds typing delay
    const currentUsername = localStorage.getItem('username'); // Get the current user's username

    messageInput.addEventListener('input', () => {
        // Ensure receiver is set before emitting typing event
        if (receiver) {
            socket.emit('typing', true, receiver); // Pass the receiver to the typing event
        }

        // Clear the previous timer
    clearTimeout(typingTimer);

    // Set a new timer to emit typing stopped after the delay
    typingTimer = setTimeout(() => {
        if (receiver) {
            socket.emit('typing', false, receiver); // Emit typing stopped with receiver
        }
    }, typingDelay);
});

// Listen for 'userTyping' event from the server
socket.on('userTyping', ({ isTyping, sender }) => {
    const mails = document.getElementsByClassName("icon-keyboard");

    // Check if there is at least one element with the class "icon-keyboard"
    if (mails.length > 0) {
        const mail = mails[0]; // Get the first element

        if (isTyping && sender !== currentUsername) {
            console.log("type");
            mail.classList.add('blink');
            // Optionally show typing indicator
            // typingIndicator.style.display = 'block';
            // typingIndicator.innerText = `${sender} is typing...`;
        } else {
            mail.classList.remove('blink');
            // Optionally hide typing indicator
            // typingIndicator.style.display = 'none';
        }
    }
});


function adjustMarginForScrollbar() {
    const chat = document.getElementById('chat');
    const messages = document.querySelectorAll('.right');

    // Check if the scrollbar is visible
    const hasScrollbar = chat.scrollHeight > chat.clientHeight;

    // Adjust right margin of messages based on scrollbar presence
    messages.forEach(message => {
        if (hasScrollbar) {
            console.log("marg")
            message.style.marginRight = '10px'; // Adjust margin when scrollbar is present
        } 
    });
}




});
