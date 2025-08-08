/* global __firebase_config, __app_id, __initial_auth_token */

// import AppWindow from './index.js'; // (Unused import removed or comment out if not needed)
importReactfrom'react';
import{ useState, useEffect, useRef} from'react';
import{ initializeApp} from'firebase/app';
import{
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from'firebase/auth';
import{
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  query,
  limit,
  getDocs
} from'firebase/firestore';
import{ marked} from'marked';
import{ createPortal} from'react-dom';
import{ Sparkles, MessageSquareMore, Image, LoaderCircle, X, ExternalLink, Menu, Plus, Play, Pause, Mic, Settings, Volume2, PenTool, Copy} from'lucide-react';

// --- Firebase Configuration ---
// The global variables are provided by the Canvas environment.
// We fall back to a local config for development purposes if they are not defined.
constlocalFirebaseConfig = {
  apiKey: "AIzaSyDhJoNaFf0qgl4VTuUXj16ysJG1hycq-p8",
  authDomain: "ai-chatbot-88602.firebaseapp.com",
  projectId: "ai-chatbot-88602",
  storageBucket: "ai-chatbot-88602.firebasestorage.app",
  messagingSenderId: "167580287666",
  appId: "1:167580287666:web:9e8313ae6e667e47d47fab",
  measurementId: "G-CXKJ8QRLZ1"
};

constfirebaseConfig = typeof__firebase_config!== 'undefined'? JSON.parse(__firebase_config) : localFirebaseConfig;
constappId = typeof__app_id!== 'undefined'? __app_id: 'default-app-id';
constinitialAuthToken = typeof__initial_auth_token!== 'undefined'? __initial_auth_token: null;

// Utility function for generating unique IDs (like conversation IDs)
constgenerateId= () =>{
  return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    constr = Math.random() * 16| 0, v = c=== 'x'? r: (r& 0x3| 0x8);
    returnv.toString(16);
  });
};

// Converts a base64 string to an ArrayBuffer
functionbase64ToArrayBuffer(base64) {
  constbinaryString = window.atob(base64);
  constlen = binaryString.length;
  constbytes = newUint8Array(len);
  for(leti= 0; i< len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  returnbytes.buffer;
}

// Converts PCM audio data to a WAV blob
functionpcmToWav(pcmData, sampleRate) {
  constpcm16 = newInt16Array(pcmData);
  constbuffer = newArrayBuffer(44+ pcm16.length* 2);
  constview = newDataView(buffer);
  constwriteString= (view, offset, string) =>{
      for(leti= 0; i< string.length; i++) {
          view.setUint8(offset+ i, string.charCodeAt(i));
      }
  };

  letoffset= 0;
  writeString(view, offset, 'RIFF'); offset+= 4;
  view.setUint32(offset, 36+ pcm16.length* 2, true); offset+= 4;
  writeString(view, offset, 'WAVE'); offset+= 4;
  writeString(view, offset, 'fmt '); offset+= 4;
  view.setUint32(offset, 16, true); offset+= 4; // Sub-chunk size
  view.setUint16(offset, 1, true); offset+= 2; // Audio format (1 = PCM)
  view.setUint16(offset, 1, true); offset+= 2; // Number of channels
  view.setUint32(offset, sampleRate, true); offset+= 4; // Sample rate
  view.setUint32(offset, sampleRate* 2, true); offset+= 4; // Byte rate
  view.setUint16(offset, 2, true); offset+= 2; // Block align
  view.setUint16(offset, 16, true); offset+= 2; // Bits per sample
  writeString(view, offset, 'data'); offset+= 4;
  view.setUint32(offset, pcm16.length* 2, true); offset+= 4; // Data size

  for(leti= 0; i< pcm16.length; i++) {
      view.setInt16(offset, pcm16[i], true);
      offset+= 2;
  }

  returnnewBlob([view], { type: 'audio/wav'});
}

// Prebuilt voices available for TTS
constprebuiltVoices = [
  'Kore', 'Puck', 'Charon', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib',
  'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux',
  'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'
];

// The main App component
functionApp() {
  const[db, setDb] = useState(null);
  const[auth, setAuth] = useState(null);
  const[isAuthReady, setIsAuthReady] = useState(false);
  const[user, setUser] = useState(null);
  const[loading, setLoading] = useState(true);
  const[error, setError] = useState(null);
  const[messages, setMessages] = useState([]);
  const[newMessage, setNewMessage] = useState('');
  const[email, setEmail] = useState('');
  const[password, setPassword] = useState('');
  const[emailSent, setEmailSent] = useState(false);
  const[isSigningInWithLink, setIsSigningInWithLink] = useState(false);
  const[isAIGenerating, setIsAIGenerating] = useState(false);
  const[authMode, setAuthMode] = useState('email-link');

  // New states for conversation history and sidebar
  const[conversations, setConversations] = useState([]);
  const[currentConversationId, setCurrentConversationId] = useState(null);
  const[isSidebarOpen, setIsSidebarOpen] = useState(true);
  const[isSummarizing, setIsSummarizing] = useState(false);
  const[isGeneratingImage, setIsGeneratingImage] = useState(false);
  const[isSpeaking, setIsSpeaking] = useState(false);
  const[voiceName, setVoiceName] = useState('Kore');
  const[showSettingsModal, setShowSettingsModal] = useState(false);
  const[selectedImage, setSelectedImage] = useState(null);

  // New states for Gemini features
  const[systemInstruction, setSystemInstruction] = useState('');
  const[generationSettings, setGenerationSettings] = useState({
    temperature: 0.9,
    topK: 40,
    topP: 0.95
  });
  const[showGeminiModal, setShowGeminiModal] = useState(false);
  const[translationTargetLanguage, setTranslationTargetLanguage] = useState('en-US');
  const[textToContinue, setTextToContinue] = useState('');
  const[textToTranslate, setTextToTranslate] = useState('');

  // New state for the creative writing feature
  const[showCreativeWriterModal, setShowCreativeWriterModal] = useState(false);
  const[creativeTopic, setCreativeTopic] = useState('');
  const[creativeStyle, setCreativeStyle] = useState('Poem');
  const[creativeTone, setCreativeTone] = useState('Neutral');

  // New states for the coding feature
  const[showCodeGeneratorModal, setShowCodeGeneratorModal] = useState(false);
  const[codeGenerationPrompt, setCodeGenerationPrompt] = useState('');
  const[codeLanguage, setCodeLanguage] = useState('JavaScript');

  constmessagesEndRef = useRef(null);
  constaudioRef = useRef(null);
  constcurrentAudioIdRef = useRef(null);
  constinputRef = useRef(null); // Added this ref for the input element

  // Scroll to bottom of messages whenever messages change
  useEffect(() =>{
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth"});
  }, [messages]);

  // Exponential backoff utility for API calls
  constfetchWithExponentialBackoff= async(url, options, retries= 5, delay= 1000) =>{
    try{
      constresponse = awaitfetch(url, options);
      if(!response.ok) {
        consterrorData = awaitresponse.json();
        thrownewError(`API error: ${errorData.error?.message || response.statusText}`);
      }
      returnresponse;
    } catch(error) {
      if(retries> 0&& error.message.includes("API error")) {
        awaitnewPromise(resolve=>setTimeout(resolve, delay));
        returnfetchWithExponentialBackoff(url, options, retries- 1, delay* 2);
      }
      throwerror;
    }
  };

  // 1. Initialize Firebase and set up authentication.
  useEffect(() =>{
    if(Object.keys(firebaseConfig).length=== 0|| !firebaseConfig.apiKey) {
      setError('Firebase configuration is missing or incomplete. Please ensure your Firebase config is correctly set, especially the API Key.');
      setLoading(false);
      return;
    }

    try{
      constfirebaseApp = initializeApp(firebaseConfig);
      constauthInstance = getAuth(firebaseApp);
      constdbInstance = getFirestore(firebaseApp);

      setAuth(authInstance);
      setDb(dbInstance);

      constunsubscribe = onAuthStateChanged(authInstance, async(currentUser) =>{
        if(currentUser) {
          setUser(currentUser);
          setIsAuthReady(true);
          setError(null);
        } else{
          if(initialAuthToken) {
             try{
               awaitsignInWithCustomToken(authInstance, initialAuthToken);
             } catch(e) {
               console.error("Custom token sign-in failed:", e);
               setError(`Custom token sign-in failed: ${e.message}. This usually means the token is invalid or expired. Please try refreshing.`);
             }
          } elseif(!isSigningInWithLink) {
            try{
              awaitsignInAnonymously(authInstance);
            } catch(e) {
              console.error("Anonymous sign-in failed:", e);
              setError(`Anonymous sign-in failed: ${e.message}. Please ensure Anonymous Authentication is enabled in your Firebase project settings.`);
            }
          }
          setIsAuthReady(true);
        }
        setLoading(false);
      });
      return() =>unsubscribe();
    } catch(e) {
      setError(`Failed to initialize Firebase: ${e.message}. Please check the console for more details.`);
      setLoading(false);
    }
  }, []);

  // 2. Handle email link sign-in.
  useEffect(() =>{
    if(!auth|| !isAuthReady) return;

    if(isSignInWithEmailLink(auth, window.location.href)) {
      setIsSigningInWithLink(true);
      setLoading(true);

      letstoredEmail= window.localStorage.getItem('emailForSignIn');

      if(!storedEmail) {
        // Using a custom modal instead of prompt
        constmodalDiv = document.createElement('div');
        modalDiv.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50';
        modalDiv.innerHTML = `
          <div class="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg max-w-sm w-full">
            <h3 class="text-xl font-bold mb-4">Confirm Email</h3>
            <p class="mb-4">Please provide your email to complete sign-in.</p>
            <input id="email-confirm-input" type="email" placeholder="Enter your email" class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
            <button id="email-confirm-button" class="w-full bg-indigo-500 text-white p-3 rounded-lg shadow-md hover:bg-indigo-600 transition-colors duration-200">Confirm</button>
          </div>
        `;
        document.body.appendChild(modalDiv);

        constemailConfirmInput = modalDiv.querySelector('#email-confirm-input');
        constemailConfirmButton = modalDiv.querySelector('#email-confirm-button');

        emailConfirmButton.onclick= () =>{
          storedEmail= emailConfirmInput.value;
          if(storedEmail) {
            document.body.removeChild(modalDiv);
            continueSignIn(storedEmail);
          } else{
            console.error("Email not provided. Please try again.");
          }
        };

        constcontinueSignIn= (emailToUse) =>{
          signInWithEmailLink(auth, emailToUse, window.location.href)
            .then((result) =>{
              window.localStorage.removeItem('emailForSignIn');
              setUser(result.user);
              setIsSigningInWithLink(false);
              setLoading(false);
              setError(null);
              window.history.replaceState({}, document.title, window.location.pathname);
            })
            .catch((error) =>{
              setError(`Error completing sign-in with link: ${error.message}`);
              setIsSigningInWithLink(false);
              setLoading(false);
              window.history.replaceState({}, document.title, window.location.pathname);
            });
        };
        return; // Exit the effect to wait for user input
      }

      signInWithEmailLink(auth, storedEmail, window.location.href)
        .then((result) =>{
          window.localStorage.removeItem('emailForSignIn');
          setUser(result.user);
          setIsSigningInWithLink(false);
          setLoading(false);
          setError(null);
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((error) =>{
          setError(`Error completing sign-in with link: ${error.message}`);
          setIsSigningInWithLink(false);
          setLoading(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
  }, [auth, isAuthReady]);

  // 3. Fetch conversations for the current user.
  useEffect(() =>{
    if(!db|| !user|| !isAuthReady) return;

    constconversationsCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations');
    constunsubscribe = onSnapshot(conversationsCollectionRef, (querySnapshot) =>{
      constfetchedConversations = [];
      querySnapshot.forEach((doc) =>{
        fetchedConversations.push({ id: doc.id, ...doc.data() });
      });

      fetchedConversations.sort((a, b) =>(b.lastUpdated?.seconds || 0) - (a.lastUpdated?.seconds || 0));

      setConversations(fetchedConversations);

      if(!currentConversationId&& fetchedConversations.length> 0) {
        setCurrentConversationId(fetchedConversations[0].id);
      } elseif(fetchedConversations.length=== 0) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    }, (firestoreError) =>{
      setError(`Failed to load conversations: ${firestoreError.message}`);
      console.error("Firestore conversations error:", firestoreError);
    });

    return() =>unsubscribe();
  }, [db, user, isAuthReady, appId, currentConversationId]);

  // 4. Fetch messages for the current conversation.
  useEffect(() =>{
    if(!db|| !user|| !currentConversationId) {
      setMessages([]); // Clear messages if no conversation is selected
      return;
    }

    constmessagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', currentConversationId, 'messages');
    constunsubscribe = onSnapshot(messagesCollectionRef, (querySnapshot) =>{
      constfetchedMessages = [];
      querySnapshot.forEach((doc) =>{
        fetchedMessages.push({ id: doc.id, ...doc.data() });
      });

      fetchedMessages.sort((a, b) =>(a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

      setMessages(fetchedMessages);
    }, (firestoreError) =>{
      setError(`Failed to load messages for conversation: ${firestoreError.message}`);
      console.error("Firestore messages error:", firestoreError);
    });

    return() =>unsubscribe();
  }, [db, user, currentConversationId, appId]);

  // 5. Start a new conversation.
  conststartNewChat= async() =>{
    if(!db|| !user) {
      setError("You must be logged in to start a new chat.");
      return;
    }

    setMessages([]);
    setNewMessage('');
    setSelectedImage(null);
    setError(null);
    setIsAIGenerating(false);
    setIsSummarizing(false);
    setIsGeneratingImage(false);

    try{
      constconversationsCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations');
      constnewConversationDocRef = doc(conversationsCollectionRef);
      constnewConvId = newConversationDocRef.id;

      awaitsetDoc(newConversationDocRef, {
        title: 'New Chat',
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      });
      setCurrentConversationId(newConvId);
      setIsSidebarOpen(false);
      // Immediately focus the input after starting a new chat
      setTimeout(() =>{
        inputRef.current?.focus();
      }, 0);
    } catch(e) {
      setError(`Failed to create a new chat: ${e.message}`);
      console.error("Error creating new conversation:", e);
    }
  };

  // 6. Handle sending a new message (and creating a new conversation if needed).
  consthandleSendMessage= async(e) =>{
    e.preventDefault();
    if(!newMessage.trim() && !selectedImage|| !user|| !db|| isAIGenerating|| isSpeaking) return;

    letconversationIdToUse= currentConversationId;
    constuserMessageText = newMessage;
    constimageToSend = selectedImage;

    setNewMessage('');
    setSelectedImage(null);

    // After sending the message, immediately refocus the input field
    setTimeout(() =>{
      inputRef.current?.focus();
    }, 0);

    constcommand = userMessageText.toLowerCase().trim();

    // If no conversation is active, create a new one.
    if(!conversationIdToUse) {
      constnewConvId = generateId();
      constconversationsCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations');
      constnewConversationDocRef = doc(conversationsCollectionRef, newConvId);
      constinitialTitle = userMessageText? (userMessageText.substring(0, 50) + (userMessageText.length> 50? '...': '')) : 'New chat with image';

      try{
        awaitsetDoc(newConversationDocRef, {
          title: initialTitle,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
        conversationIdToUse= newConvId;
        setCurrentConversationId(newConvId);
      } catch(createError) {
        setError(`Failed to create new conversation: ${createError.message}`);
        console.error("Error creating new conversation:", createError);
        return;
      }
    } else{
      // Otherwise, just update the lastUpdated timestamp of the current conversation.
      constconversationDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationIdToUse);
      try{
        awaitsetDoc(conversationDocRef, { lastUpdated: serverTimestamp() }, { merge: true});
      } catch(updateError) {
        console.error("Error updating conversation timestamp:", updateError);
      }
    }

    // Add user message to Firestore
    try{
      constmessagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationIdToUse, 'messages');
      awaitaddDoc(messagesCollectionRef, {
        text: userMessageText,
        userId: user.uid,
        userName: `User_${user.uid.substring(0, 5)}`,
        timestamp: serverTimestamp(),
        type: 'user-message',
        imageData: imageToSend
      });
    } catch(e) {
      setError(`Failed to send message: ${e.message}`);
      return;
    }

    if(imageToSend) {
      handleImageAnalysis(userMessageText, imageToSend, conversationIdToUse);
    } elseif(command.startsWith('image of')) {
      constimagePrompt = userMessageText.substring('image of'.length).trim();
      handleGenerateImage(imagePrompt, conversationIdToUse);
    } else{
      handleAIResponse(userMessageText, conversationIdToUse);
    }
  };

  // Function to handle image upload
  consthandleImageUpload= (event) =>{
    constfile = event.target.files[0];
    if(file) {
      constreader = newFileReader();
      reader.onloadend= () =>{
        setSelectedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 7. Handle sending the sign-in email link.
  consthandleSendSignInLink= async(e) =>{
    e.preventDefault();
    if(!auth|| !email.trim()) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    constactionCodeSettings = {
      url: window.location.origin,
      handleCodeInApp: true,
    };
    try{
      awaitsendSignInLinkToEmail(auth, email, actionCodeSettings);
      setEmailSent(true);
      window.localStorage.setItem('emailForSignIn', email);
      setLoading(false);
    } catch(error) {
      setError(`Failed to send sign-in link: ${error.message}`);
      setLoading(false);
    }
  };

  // 8. Handle Email/Password Registration
  consthandleEmailPasswordSignUp= async(e) =>{
    e.preventDefault();
    if(!auth|| !email.trim() || !password.trim()) {
      setError("Please enter a valid email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try{
      awaitcreateUserWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
      setLoading(false);
    } catch(error) {
      setError(`Failed to sign up: ${error.message}`);
      setLoading(false);
    }
  };

  // 9. Handle Email/Password Login
  consthandleEmailPasswordSignIn= async(e) =>{
    e.preventDefault();
    if(!auth|| !email.trim() || !password.trim()) {
      setError("Please enter a valid email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try{
      awaitsignInWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
      setLoading(false);
    } catch(error) {
      setError(`Failed to sign in: ${error.message}`);
      setLoading(false);
    }
  };

  // 10. Handle sign-out.
  consthandleSignOut= async() =>{
    if(!auth) return;
    try{
      awaitsignOut(auth);
      // Reset states
      setUser(null);
      setConversations([]);
      setMessages([]);
      setCurrentConversationId(null);
      setError(null);
    } catch(error) {
      setError(`Failed to sign out: ${error.message}`);
      console.error("Sign out error:", error);
    }
  };

  // 11. Handle AI response using Gemini API.
  consthandleAIResponse= async(userPrompt, conversationId) =>{
    if(!user|| !db|| !conversationId) return;
    setIsAIGenerating(true);
    letpromptText= userPrompt;
    letnewMessages= [...messages];
    constmessagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationId, 'messages');
    // Get the conversation history to provide context to the AI
    letchatHistory= [];
    try{
      constq = query(messagesCollectionRef, limit(20));
      constquerySnapshot = awaitgetDocs(q);
      querySnapshot.forEach(doc=>{
        constdata = doc.data();
        if(data.type === 'user-message') {
          chatHistory.push({ role: 'user', parts: [{ text: data.text }] });
        } elseif(data.type === 'ai-message') {
          chatHistory.push({ role: 'model', parts: [{ text: data.text }] });
        }
      });
      // Add the latest user prompt
      chatHistory.push({ role: "user", parts: [{ text: promptText}] });
    } catch(e) {
      console.error("Error fetching chat history:", e);
      // If fetching history fails, just use the current prompt
      chatHistory= [{ role: "user", parts: [{ text: promptText}] }];
    }
    constpayload = {
      contents: chatHistory,
      generationConfig: {
        temperature: generationSettings.temperature,
        topK: generationSettings.topK,
        topP: generationSettings.topP,
      },
      systemInstruction: systemInstruction? { parts: [{ text: systemInstruction}] } : undefined,
    };
    constapiKey = "";
    constapiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    try{
      constresponse = awaitfetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      constresult = awaitresponse.json();
      constaiResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';
      // Add AI response to Firestore
      awaitaddDoc(messagesCollectionRef, {
        text: aiResponseText,
        userId: 'ai',
        userName: 'Gemini',
        timestamp: serverTimestamp(),
        type: 'ai-message'
      });
    } catch(e) {
      console.error("Gemini API error:", e);
      setError(`Gemini API error: ${e.message}`);
    } finally{
      setIsAIGenerating(false);
    }
  };

  // 12. Handle image analysis with Gemini Vision API
  consthandleImageAnalysis= async(userPrompt, imageData, conversationId) =>{
    if(!user|| !db|| !conversationId) return;
    setIsAIGenerating(true);
    constmessagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationId, 'messages');
    // Remove the data URL prefix "data:image/png;base64,"
    constbase64ImageData = imageData.split(',')[1];
    constpayload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: userPrompt|| 'What is in this image?'},
            {
              inlineData: {
                mimeType: "image/png", // Assuming PNG, but should be dynamic if possible
                data: base64ImageData
              }
            }
          ]
        }
      ],
    };
    constapiKey = "";
    constapiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    try{
      constresponse = awaitfetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      constresult = awaitresponse.json();
      constaiResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';

      awaitaddDoc(messagesCollectionRef, {
        text: aiResponseText,
        userId: 'ai',
        userName: 'Gemini',
        timestamp: serverTimestamp(),
        type: 'ai-message'
      });
    } catch(e) {
      console.error("Gemini Vision API error:", e);
      setError(`Gemini Vision API error: ${e.message}`);
    } finally{
      setIsAIGenerating(false);
    }
  };

  // 13. Handle image generation with Gemini API
  consthandleGenerateImage= async(imagePrompt, conversationId) =>{
    if(!user|| !db|| !conversationId) return;
    setIsGeneratingImage(true);

    letconversationIdToUse= currentConversationId;
    if(!conversationIdToUse) {
      constnewConvId = generateId();
      constconversationsCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations');
      constnewConversationDocRef = doc(conversationsCollectionRef, newConvId);
      try{
        awaitsetDoc(newConversationDocRef, {
          title: imagePrompt.substring(0, 50) + '...',
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
        conversationIdToUse= newConvId;
        setCurrentConversationId(newConvId);
      } catch(createError) {
        setError(`Failed to create new conversation: ${createError.message}`);
        console.error("Error creating new conversation:", createError);
        return;
      }
    }

    // Add user prompt to Firestore
    try{
      constmessagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationIdToUse, 'messages');
      awaitaddDoc(messagesCollectionRef, {
        text: imagePrompt,
        userId: user.uid,
        userName: `User_${user.uid.substring(0, 5)}`,
        timestamp: serverTimestamp(),
        type: 'image-prompt-message'
      });
    } catch(e) {
      setError(`Failed to send message: ${e.message}`);
      return;
    }

    constpayload = {
      instances: { prompt: imagePrompt},
      parameters: { "sampleCount": 1}
    };
    constapiKey = "";
    constapiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

    try{
      constresponse = awaitfetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      constresult = awaitresponse.json();
      constbase64Data = result?.predictions?.[0]?.bytesBase64Encoded;

      if(!base64Data) {
        thrownewError('Image generation failed: No image data received.');
      }

      constimageUrl = `data:image/png;base64,${base64Data}`;

      constmessagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationIdToUse, 'messages');
      awaitaddDoc(messagesCollectionRef, {
        imageUrl: imageUrl,
        userId: 'ai',
        userName: 'Gemini',
        timestamp: serverTimestamp(),
        type: 'image-message'
      });

    } catch(e) {
      console.error("Gemini Image generation API error:", e);
      setError(`Gemini Image generation API error: ${e.message}`);
    } finally{
      setIsGeneratingImage(false);
    }
  };

  // 14. Handle TTS generation and playback.
  consthandleTTS= async(textToSpeak) =>{
    if(isSpeaking) {
      audioRef.current?.pause();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    constutteranceId = generateId();
    currentAudioIdRef.current = utteranceId;

    constpayload = {
      contents: [{
        parts: [{ text: textToSpeak}]
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName}
          }
        }
      },
      model: "gemini-2.5-flash-preview-tts"
    };

    constapiKey = "";
    constapiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

    try{
      constresponse = awaitfetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      constresult = awaitresponse.json();
      constpart = result?.candidates?.[0]?.content?.parts?.[0];
      constaudioData = part?.inlineData?.data;
      constmimeType = part?.inlineData?.mimeType;

      if(audioData&& mimeType&& mimeType.startsWith("audio/")) {
        constsampleRate = parseInt(mimeType.match(/rate=(\d+)/)[1], 10);
        constpcmData = base64ToArrayBuffer(audioData);
        constwavBlob = pcmToWav(pcmData, sampleRate);
        constaudioUrl = URL.createObjectURL(wavBlob);

        if(currentAudioIdRef.current !== utteranceId) {
          URL.revokeObjectURL(audioUrl);
          return;
        }

        if(audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.onended= () =>{
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
          };
          audioRef.current.play();
        }
      } else{
        thrownewError("No audio data received from API.");
      }
    } catch(e) {
      console.error("TTS API error:", e);
      setError(`TTS API error: ${e.message}`);
      setIsSpeaking(false);
    }
  };

  // 15. Handle code generation with Gemini API.
  consthandleGenerateCode= async() =>{
    if(!user|| !db|| !codeGenerationPrompt|| isAIGenerating) return;
    setIsAIGenerating(true);
    setShowCodeGeneratorModal(false);

    letconversationIdToUse= currentConversationId;
    constuserPrompt = codeGenerationPrompt;
    constlanguage = codeLanguage;

    // Create a new conversation if one doesn't exist
    if(!conversationIdToUse) {
      constnewConvId = generateId();
      constconversationsCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations');
      constnewConversationDocRef = doc(conversationsCollectionRef, newConvId);
      try{
        awaitsetDoc(newConversationDocRef, {
          title: userPrompt.substring(0, 50) + '...',
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
        conversationIdToUse= newConvId;
        setCurrentConversationId(newConvId);
      } catch(createError) {
        setError(`Failed to create new conversation: ${createError.message}`);
        console.error("Error creating new conversation:", createError);
        setIsAIGenerating(false);
        return;
      }
    }

    // Add user's code request to Firestore
    try{
      constmessagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationIdToUse, 'messages');
      awaitaddDoc(messagesCollectionRef, {
        text: `Generate a complete code snippet in ${language}for the following request: \n\n${userPrompt}`,
        userId: user.uid,
        userName: `User_${user.uid.substring(0, 5)}`,
        timestamp: serverTimestamp(),
        type: 'code-request'
      });
    } catch(e) {
      setError(`Failed to send code request: ${e.message}`);
      setIsAIGenerating(false);
      return;
    }

    // Prepare the prompt for the Gemini API
    constfinalPrompt = `Generate a complete, well-commented code snippet in ${language}for the following request: ${userPrompt}. The output must be a single markdown code block.`;
    constpayload = {
      contents: [{ role: "user", parts: [{ text: finalPrompt}] }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      }
    };

    constapiKey = "";
    constapiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    try{
      constresponse = awaitfetchWithExponentialBackoff(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      constresult = awaitresponse.json();
      constaiResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No code generated.';

      // Add AI's code response to Firestore
      constmessagesCollectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'conversations', conversationIdToUse, 'messages');
      awaitaddDoc(messagesCollectionRef, {
        text: aiResponseText,
        userId: 'ai',
        userName: 'Gemini',
        timestamp: serverTimestamp(),
        type: 'code-response',
        language: language,
      });

    } catch(e) {
      console.error("Gemini Code generation API error:", e);
      setError(`Gemini Code generation API error: ${e.message}`);
    } finally{
      setIsAIGenerating(false);
      setCodeGenerationPrompt('');
    }
  };

  // Copy to clipboard handler
  consthandleCopyToClipboard= (text) =>{
    navigator.clipboard.writeText(text).then(() =>{
      // You could add a small visual cue here
      console.log('Code copied to clipboard!');
    }).catch(err=>{
      console.error('Failed to copy text: ', err);
    });
  };

  constrenderMessage= (message, isLastMessage) =>{
    constisUser = message.userId === user?.uid;
    constisAi = message.userId === 'ai';
    constisCodeResponse = message.type === 'code-response';

    constmessageClasses = isUser
      ? 'bg-indigo-500 text-white self-end rounded-br-none'
      : isAi
        ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 self-start rounded-bl-none'
        : '';
    constnameClasses = isUser
      ? 'text-indigo-400 text-right'
      : 'text-gray-500 dark:text-gray-400';

    constmessageContent= () =>{
      if(message.imageData) {
        return(
          <divclassName="flex flex-col items-start space-y-2">
            <pclassName="text-sm font-medium text-gray-700 dark:text-gray-300">
              {message.text}
            </p>
            <img
              src={message.imageData}
              alt="User uploaded"
              className="max-w-xs rounded-lg shadow-md"
              style={{ maxHeight: '300px'}}
            />
          </div>
        );
      } elseif(message.imageUrl) {
        return(
          <img
            src={message.imageUrl}
            alt="AI generated"
            className="max-w-full rounded-lg shadow-md"
            style={{ maxHeight: '400px'}}
          />
        );
      } elseif(isCodeResponse) {
        // Find the code block and extract the content
        constcodeBlockMatch = message.text.match(/```(?:\w+)?\n([\s\S]*?)```/);
        constcodeContent = codeBlockMatch? codeBlockMatch[1] : message.text;

        return(
          <divclassName="flex flex-col w-full">
            <divclassName="p-4 bg-gray-800 text-white rounded-t-xl overflow-x-auto relative">
              <button
                onClick={() =>handleCopyToClipboard(codeContent)}
                className="absolute top-2 right-2 p-1 text-gray-400 hover:text-white bg-gray-700 rounded-md transition-colors"
                title="Copy to clipboard"
              >
                <Copysize={16}/>
              </button>
              <divdangerouslySetInnerHTML={{ __html: marked.parse(message.text) }}/>
            </div>
            {message.text.length> 500&& (
              <pclassName="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Scroll to view the full code snippet.
              </p>
            )}
          </div>
        );
      }
      return<divdangerouslySetInnerHTML={{ __html: marked.parse(message.text) }}/>;
    };

    return(
      <div
        key={message.id}
        className={`flex flex-col p-4 space-y-1 ${isUser? 'items-end': 'items-start'
          }`}
      >
        <spanclassName={`text-xs font-semibold ${nameClasses}`}>
          {isUser? 'You': 'Gemini'}
        </span>
        <div
          className={`max-w-3xl p-3 rounded-xl shadow-md whitespace-pre-wrap ${messageClasses}${isCodeResponse? 'w-full': 'max-w-3xl'}`}
        >
          {messageContent()}
        </div>
        <divclassName="flex items-center space-x-2 mt-1">
          {isAi&& message.text && !isCodeResponse&& (
            <button
              onClick={() =>handleTTS(message.text)}
              className="text-gray-500 dark:text-gray-400 hover:text-indigo-500 transition-colors"
            >
              {isSpeaking&& currentAudioIdRef.current === message.id ? <Pausesize={16}/>: <Playsize={16}/>}
            </button>
          )}
          <spanclassName="text-xs text-gray-500 dark:text-gray-400">
            {message.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}
          </span>
        </div>
      </div>
    );
  };

  constMemoizedMessages = React.memo(({ messages}) =>{
    if(messages.length=== 0) {
      return(
        <divclassName="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-600 p-4">
          <MessageSquareMoreclassName="h-16 w-16 mb-4"/>
          <h2className="text-xl font-bold mb-2">Start a new conversation</h2>
          <pclassName="max-w-sm">
            Ask me anything, generate images, or get help writing code.
          </p>
        </div>
      );
    }
    return(
      <>
        {messages.map((message, index) =>
          renderMessage(message, index=== messages.length- 1)
        )}
        <divref={messagesEndRef}/>
      </>
    );
  });

  constAuthUI= () =>(
    <divclassName="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
      <divclassName="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1className="text-3xl font-bold text-center mb-6">Welcome</h1>
        {error&& (
          <divclassName="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800">
            {error}
          </div>
        )}
        <divclassName="flex space-x-2 mb-6">
          <button
            onClick={() =>setAuthMode('email-link')}
            className={`flex-1 p-3 rounded-xl font-semibold transition-colors ${authMode=== 'email-link'? 'bg-indigo-500 text-white': 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
              }`}
          >
            Magic Link
          </button>
          <button
            onClick={() =>setAuthMode('email-password')}
            className={`flex-1 p-3 rounded-xl font-semibold transition-colors ${authMode=== 'email-password'? 'bg-indigo-500 text-white': 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
              }`}
          >
            Email/Password
          </button>
        </div>
        {authMode=== 'email-link'? (
          <formonSubmit={handleSendSignInLink}className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) =>setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="w-full bg-indigo-500 text-white p-3 rounded-lg shadow-md hover:bg-indigo-600 transition-colors duration-200"
              disabled={loading}
            >
              {loading? <LoaderCircleclassName="animate-spin h-5 w-5 mx-auto"/>: 'Send Sign-in Link'}
            </button>
          </form>
        ) : (
          <divclassName="space-y-4">
            <formonSubmit={handleEmailPasswordSignIn}className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) =>setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="password"
                value={password}
                onChange={(e) =>setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="w-full bg-indigo-500 text-white p-3 rounded-lg shadow-md hover:bg-indigo-600 transition-colors duration-200"
                disabled={loading}
              >
                {loading? <LoaderCircleclassName="animate-spin h-5 w-5 mx-auto"/>: 'Sign In'}
              </button>
            </form>
            <button
              onClick={handleEmailPasswordSignUp}
              className="w-full text-indigo-500 p-3 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors duration-200"
            >
              Don't have an account? Sign Up
            </button>
          </div>
        )}
        {emailSent&& (
          <pclassName="mt-4 text-center text-sm text-green-600 dark:text-green-400">
            A sign-in link has been sent to your email!
          </p>
        )}
      </div>
    </div>
  );

  constUserModal= ({ isOpen, onClose, title, children}) =>{
    if(!isOpen) returnnull;
    returncreatePortal(
      <divclassName="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <divclassName="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
          <divclassName="flex justify-between items-center mb-4">
            <h2className="text-xl font-bold">{title}</h2>
            <buttononClick={onClose}className="p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">
              <XclassName="h-5 w-5"/>
            </button>
          </div>
          {children}
        </div>
      </div>,
      document.body
    );
  };

  constCodeGeneratorModal= ({ isOpen, onClose, onGenerate}) =>{
    if(!isOpen) returnnull;
    return(
      <UserModalisOpen={isOpen}onClose={onClose}title="Code Generator">
        <divclassName="space-y-4">
          <div>
            <labelclassName="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Language
            </label>
            <select
              value={codeLanguage}
              onChange={(e) =>setCodeLanguage(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <optionvalue="JavaScript">JavaScript</option>
              <optionvalue="Python">Python</option>
              <optionvalue="HTML">HTML</option>
              <optionvalue="CSS">CSS</option>
              <optionvalue="React">React</option>
              <optionvalue="Java">Java</option>
              <optionvalue="C++">C++</option>
              <optionvalue="Go">Go</option>
              <optionvalue="Swift">Swift</option>
            </select>
          </div>
          <div>
            <labelclassName="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Code Prompt
            </label>
            <textarea
              value={codeGenerationPrompt}
              onChange={(e) =>setCodeGenerationPrompt(e.target.value)}
              placeholder="e.g., 'A function that reverses a string' or 'A simple HTML layout with a header and footer'"
              rows="5"
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            ></textarea>
          </div>
          <button
            onClick={onGenerate}
            className="w-full bg-indigo-500 text-white p-3 rounded-lg shadow-md hover:bg-indigo-600 transition-colors duration-200"
            disabled={isAIGenerating|| !codeGenerationPrompt}
          >
            {isAIGenerating? (
              <LoaderCircleclassName="animate-spin h-5 w-5 mx-auto"/>
            ) : (
              'Generate Code'
            )}
          </button>
        </div>
      </UserModal>
    );
  };

  constChatWindow= () =>(
    <divclassName="flex flex-col h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <divclassName={`fixed inset-y-0 left-0 transform ${isSidebarOpen? 'translate-x-0': '-translate-x-full'}lg:translate-x-0 lg:static lg:inset-y-0 w-64 bg-white dark:bg-gray-800 transition-transform duration-300 ease-in-out z-40 flex flex-col`}>
        <divclassName="p-4 flex items-center justify-between border-b dark:border-gray-700">
          <h2className="text-xl font-bold">Conversations</h2>
          <button
            onClick={startNewChat}
            className="p-2 rounded-full bg-indigo-500 text-white shadow-md hover:bg-indigo-600 transition-colors"
            title="New Chat"
          >
            <PlusclassName="h-5 w-5"/>
          </button>
        </div>
        <divclassName="flex-1 overflow-y-auto p-2">
          {conversations.length> 0? (
            conversations.map((conv) =>(
              <div
                key={conv.id}
                onClick={() =>{ setCurrentConversationId(conv.id); setIsSidebarOpen(false); }}
                className={`p-3 my-2 rounded-xl cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors truncate ${currentConversationId=== conv.id ? 'bg-indigo-100 dark:bg-indigo-900 font-semibold': 'bg-gray-100 dark:bg-gray-800'
                  }`}
                title={conv.title}
              >
                {conv.title}
              </div>
            ))
          ) : (
            <pclassName="text-center text-sm text-gray-400 mt-4">No conversations yet.</p>
          )}
        </div>
        <divclassName="p-4 border-t dark:border-gray-700">
          <pclassName="text-sm font-semibold text-gray-500">
            User ID: <spanclassName="text-xs break-all">{user.uid}</span>
          </p>
          <button
            onClick={handleSignOut}
            className="mt-4 w-full bg-red-500 text-white p-3 rounded-lg shadow-md hover:bg-red-600 transition-colors duration-200"
          >
            Sign Out
          </button>
        </div>
      </div>

      <divclassName="flex-1 flex flex-col lg:ml-64">
        <headerclassName="bg-white dark:bg-gray-800 shadow-md p-4 flex items-center justify-between lg:hidden">
          <buttononClick={() =>setIsSidebarOpen(!isSidebarOpen)}className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
            <MenuclassName="h-6 w-6"/>
          </button>
          <h1className="text-lg font-bold truncate">
            {conversations.find(c=>c.id === currentConversationId)?.title || 'New Chat'}
          </h1>
          <buttononClick={() =>setShowSettingsModal(true)}className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
            <SettingsclassName="h-6 w-6"/>
          </button>
        </header>

        <mainclassName="flex-1 overflow-y-auto p-4 space-y-4">
          <MemoizedMessagesmessages={messages}/>
          {(isAIGenerating|| isGeneratingImage) && (
            <divclassName={`flex flex-col p-4 space-y-1 items-start`}>
              <spanclassName={`text-xs font-semibold text-gray-500 dark:text-gray-400`}>
                Gemini
              </span>
              <divclassName={`max-w-3xl p-3 rounded-xl shadow-md whitespace-pre-wrap bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none`}>
                <divclassName="flex items-center space-x-2">
                  <LoaderCircleclassName="animate-spin"size={20}/>
                  <span>{isGeneratingImage? 'Generating image...': 'Thinking...'}</span>
                </div>
              </div>
            </div>
          )}
          <divref={messagesEndRef}/>
        </main>

        <footerclassName="bg-white dark:bg-gray-800 p-4 border-t dark:border-gray-700">
          {error&& (
            <divclassName="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800 flex items-center justify-between">
              <span>{error}</span>
              <buttononClick={() =>setError(null)}className="text-red-700 dark:text-red-800 hover:text-red-900">
                <Xsize={16}/>
              </button>
            </div>
          )}
          <formonSubmit={handleSendMessage}className="flex space-x-2">
            <button
              type="button"
              onClick={() =>setShowCodeGeneratorModal(true)}
              className="p-3 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-indigo-500 hover:text-white transition-colors"
              title="Generate Code"
            >
              <PenToolsize={24}/>
            </button>
            <labelclassName="p-3 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-indigo-500 hover:text-white transition-colors cursor-pointer">
              <Imagesize={24}/>
              <inputtype="file"className="hidden"onChange={handleImageUpload}accept="image/*"/>
            </label>
            <divclassName="relative flex-1">
              <textarea
                ref={inputRef}
                value={newMessage}
                onChange={(e) =>setNewMessage(e.target.value)}
                onKeyDown={(e) =>{
                  if(e.key === 'Enter'&& !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                className="w-full p-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={1}
                placeholder={selectedImage? 'Ask about the image...': 'Message Gemini...'}
                disabled={isAIGenerating|| isGeneratingImage}
                style={{ maxHeight: '150px'}}
              />
              {selectedImage&& (
                <divclassName="absolute top-2 right-2 p-1 bg-white dark:bg-gray-800 rounded-full shadow">
                  <buttontype="button"onClick={() =>setSelectedImage(null)}className="text-gray-500 hover:text-gray-700">
                    <Xsize={16}/>
                  </button>
                </div>
              )}
            </div>
            <button
              type="submit"
              className="p-3 bg-indigo-500 text-white rounded-xl shadow-md hover:bg-indigo-600 transition-colors"
              disabled={isAIGenerating|| isGeneratingImage|| (!newMessage.trim() && !selectedImage)}
            >
              <Sparklessize={24}/>
            </button>
          </form>
        </footer>
      </div>

      <UserModalisOpen={showSettingsModal}onClose={() =>setShowSettingsModal(false)}title="App Settings">
        <divclassName="space-y-4">
          <div>
            <h3className="text-lg font-semibold mb-2">TTS Settings</h3>
            <labelclassName="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Voice</label>
            <select
              value={voiceName}
              onChange={(e) =>setVoiceName(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {prebuiltVoices.map((voice) =>(
                <optionkey={voice}value={voice}>{voice}</option>
              ))}
            </select>
          </div>
        </div>
      </UserModal>

      <CodeGeneratorModalisOpen={showCodeGeneratorModal}onClose={() =>setShowCodeGeneratorModal(false)}onGenerate={handleGenerateCode}/>

    </div>
  );

  if(loading|| !isAuthReady) {
    return(
      <divclassName="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <LoaderCircleclassName="animate-spin h-12 w-12 text-indigo-500"/>
      </div>
    );
  }

  if(error&& !user) {
    return(
      <divclassName="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <divclassName="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
          <pclassName="text-red-500 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={() =>window.location.reload()}
            className="bg-indigo-500 text-white p-3 rounded-lg shadow-md hover:bg-indigo-600 transition-colors duration-200"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return(
    <divclassName="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
      {!user? <AuthUI/>: <ChatWindow/>}
      <audioref={audioRef}className="hidden"/>
    </div>
  );
}

exportdefaultApp;