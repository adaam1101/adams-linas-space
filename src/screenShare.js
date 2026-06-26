// WebRTC screen sharing module for Adam & Lina's Space
import { db } from './firebase.js';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  addDoc,
  getDocs
} from 'firebase/firestore';
import { getCurrentUser } from './auth.js';

let peerConnection = null;
let localStream = null;
let callDocRef = null;
let unsubscribeCall = null;
let unsubscribeSenderCandidates = null;
let unsubscribeReceiverCandidates = null;

const servers = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
    }
  ],
  iceCandidatePoolSize: 10
};

export async function startScreenSharing(onLocalStream, onRemoteStream, onStateChange) {
  const user = getCurrentUser();
  if (!user) return;

  try {
    // 1. Get media stream
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always'
      },
      audio: true
    });
    onLocalStream(localStream);

    // 2. Setup Peer Connection
    peerConnection = new RTCPeerConnection(servers);
    
    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Handle remote tracks
    peerConnection.ontrack = (event) => {
      if (onRemoteStream && event.streams[0]) {
        onRemoteStream(event.streams[0]);
      }
    };

    // Track state changes
    peerConnection.onconnectionstatechange = () => {
      if (onStateChange) onStateChange(peerConnection.connectionState);
    };

    // Listen for browser "Stop sharing" button click
    localStream.getVideoTracks()[0].addEventListener('ended', () => {
      stopScreenSharing();
    });

    // 3. Signaling setup
    callDocRef = doc(db, 'calls', 'screen-share');
    const senderCandidatesRef = collection(db, 'calls', 'screen-share', 'senderCandidates');
    const receiverCandidatesRef = collection(db, 'calls', 'screen-share', 'receiverCandidates');

    // Clean up any old connection leftovers first
    await deleteCollectionDocs('calls/screen-share/senderCandidates');
    await deleteCollectionDocs('calls/screen-share/receiverCandidates');

    // Gather ICE Candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(senderCandidatesRef, event.candidate.toJSON());
      }
    };

    // Create Offer
    const offerDescription = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type
    };

    await setDoc(callDocRef, {
      offer,
      sender: user.key,
      senderName: user.name,
      active: true,
      createdAt: new Date().getTime()
    });

    // Listen for Remote Answer
    unsubscribeCall = onSnapshot(callDocRef, (snapshot) => {
      const data = snapshot.data();
      if (peerConnection && !peerConnection.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        peerConnection.setRemoteDescription(answerDescription);
      }
    });

    // Listen for Receiver ICE Candidates
    unsubscribeReceiverCandidates = onSnapshot(receiverCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && peerConnection) {
          const candidate = new RTCIceCandidate(change.doc.data());
          peerConnection.addIceCandidate(candidate).catch(e => console.error(e));
        }
      });
    });

  } catch (err) {
    console.error('Error starting screen share:', err);
    stopScreenSharing();
    throw err;
  }
}

export function listenForIncomingShare(onStream, onEnd) {
  const user = getCurrentUser();
  if (!user) return () => {};

  const callDocRef = doc(db, 'calls', 'screen-share');
  const senderCandidatesRef = collection(db, 'calls', 'screen-share', 'senderCandidates');
  const receiverCandidatesRef = collection(db, 'calls', 'screen-share', 'receiverCandidates');

  let receiverConnection = null;

  const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
    const data = snapshot.data();

    // If a call is active and started by someone else
    if (data?.active && data.sender !== user.key) {
      if (!receiverConnection) {
        receiverConnection = new RTCPeerConnection(servers);
        peerConnection = receiverConnection; // keep track globally for stop/disconnect

        receiverConnection.ontrack = (event) => {
          if (event.streams[0]) {
            onStream(event.streams[0], data.senderName);
          }
        };

        receiverConnection.onconnectionstatechange = () => {
          if (receiverConnection.connectionState === 'disconnected' || receiverConnection.connectionState === 'failed') {
            stopIncomingShare(onEnd);
            receiverConnection = null;
          }
        };

        // Gather ICE Candidates from receiver and save them to receiverCandidates subcollection
        receiverConnection.onicecandidate = (event) => {
          if (event.candidate) {
            addDoc(receiverCandidatesRef, event.candidate.toJSON());
          }
        };

        // Set Remote Offer
        const offerDescription = new RTCSessionDescription(data.offer);
        await receiverConnection.setRemoteDescription(offerDescription);

        // Create Answer
        const answerDescription = await receiverConnection.createAnswer();
        await receiverConnection.setLocalDescription(answerDescription);

        const answer = {
          sdp: answerDescription.sdp,
          type: answerDescription.type
        };

        await updateDoc(callDocRef, { answer });

        // Listen for Sender ICE Candidates
        unsubscribeSenderCandidates = onSnapshot(senderCandidatesRef, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' && receiverConnection) {
              const candidate = new RTCIceCandidate(change.doc.data());
              receiverConnection.addIceCandidate(candidate).catch(e => console.error(e));
            }
          });
        });
      }
    } else {
      if (receiverConnection) {
        stopIncomingShare(onEnd);
        receiverConnection = null;
      }
    }
  });

  return () => {
    unsubscribe();
    if (receiverConnection) {
      stopIncomingShare(onEnd);
    }
  };
}

function stopIncomingShare(onEnd) {
  if (unsubscribeSenderCandidates) {
    unsubscribeSenderCandidates();
    unsubscribeSenderCandidates = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (onEnd) onEnd();
}

export async function stopScreenSharing() {
  if (unsubscribeCall) {
    unsubscribeCall();
    unsubscribeCall = null;
  }
  if (unsubscribeReceiverCandidates) {
    unsubscribeReceiverCandidates();
    unsubscribeReceiverCandidates = null;
  }
  if (unsubscribeSenderCandidates) {
    unsubscribeSenderCandidates();
    unsubscribeSenderCandidates = null;
  }

  if (callDocRef) {
    try {
      await deleteDoc(callDocRef);
      await deleteCollectionDocs('calls/screen-share/senderCandidates');
      await deleteCollectionDocs('calls/screen-share/receiverCandidates');
    } catch (err) {
      console.error('Error cleaning up firestore signaling:', err);
    }
    callDocRef = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

async function deleteCollectionDocs(path) {
  try {
    const querySnapshot = await getDocs(collection(db, path));
    const promises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(promises);
  } catch (err) {
    console.error(`Error deleting collection docs for ${path}:`, err);
  }
}
