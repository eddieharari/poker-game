import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../socket.js';

const TURN_USER = '94464a0a496e8fdcb31287a0';
const TURN_CRED = 'QNsEtAYzvaF9G4jp';

const ICE_SERVERS = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80',                 username: TURN_USER, credential: TURN_CRED },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp',   username: TURN_USER, credential: TURN_CRED },
  { urls: 'turn:global.relay.metered.ca:443',                username: TURN_USER, credential: TURN_CRED },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: TURN_USER, credential: TURN_CRED },
];

interface UseVoiceChatOptions {
  vocal: boolean;
  opponentPlayerId: string | null;
  isInitiator: boolean;
}

interface VoiceChatState {
  connected: boolean;
  muted: boolean;
  toggleMute: () => void;
}

export function useVoiceChat({ vocal, opponentPlayerId, isInitiator }: UseVoiceChatOptions): VoiceChatState {
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const enabled = !streamRef.current.getAudioTracks()[0]?.enabled;
      streamRef.current.getAudioTracks().forEach(t => { t.enabled = enabled; });
      setMuted(!enabled);
    }
  }, []);

  useEffect(() => {
    if (!vocal || !opponentPlayerId) return;

    const socket = getSocket();
    const targetPlayerId: string = opponentPlayerId; // narrowed non-null for async closures
    let destroyed = false;
    let pc: RTCPeerConnection | null = null;

    async function start() {
      let localStream: MediaStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (err) {
        console.warn('[useVoiceChat] microphone access denied:', err);
        return;
      }
      if (destroyed) { localStream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = localStream;

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      localStream.getAudioTracks().forEach(track => pc!.addTrack(track, localStream));

      pc.ontrack = (event) => {
        if (!remoteAudioRef.current) {
          remoteAudioRef.current = new Audio();
          remoteAudioRef.current.autoplay = true;
        }
        remoteAudioRef.current.srcObject = event.streams[0];
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc:signal', { toPlayerId: targetPlayerId, signal: { type: 'ice', candidate: event.candidate } });
        }
      };

      pc.onconnectionstatechange = () => {
        if (!pc) return;
        setConnected(pc.connectionState === 'connected');
      };

      if (isInitiator) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:signal', { toPlayerId: targetPlayerId, signal: { type: 'offer', sdp: pc.localDescription } });
        } catch (err) {
          console.error('[useVoiceChat] offer error:', err);
        }
      }
    }

    function onSignal({ signal: rawSignal }: { fromPlayerId: string; signal: unknown }) {
      if (!pc) return;
      const signal = rawSignal as { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
      if (signal.type === 'offer' && signal.sdp) {
        pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
          .then(() => pc!.createAnswer())
          .then(answer => pc!.setLocalDescription(answer))
          .then(() => socket.emit('webrtc:signal', { toPlayerId: targetPlayerId, signal: { type: 'answer', sdp: pc!.localDescription } }))
          .catch(err => console.error('[useVoiceChat] answer error:', err));
      } else if (signal.type === 'answer' && signal.sdp) {
        pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
          .catch(err => console.error('[useVoiceChat] set answer error:', err));
      } else if (signal.type === 'ice' && signal.candidate) {
        pc.addIceCandidate(new RTCIceCandidate(signal.candidate))
          .catch(err => console.error('[useVoiceChat] ice error:', err));
      }
    }

    socket.on('webrtc:signal', onSignal);
    start();

    return () => {
      destroyed = true;
      socket.off('webrtc:signal', onSignal);
      if (pc) { pc.close(); pcRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = null; remoteAudioRef.current = null; }
      setConnected(false);
    };
  }, [vocal, opponentPlayerId, isInitiator]);

  return { connected, muted, toggleMute };
}
