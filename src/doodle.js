// Canvas drawing & Firestore sync module
import { db } from './firebase.js';
import { collection, addDoc, query, where, onSnapshot, getDocs, deleteDoc } from 'firebase/firestore';

let strokesUnsubscribe = null;

// Initialize local drawing event listeners on a canvas
export function initCanvasDrawing(canvas, getDrawingSettings, onStrokeComplete) {
  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let currentPoints = [];

  // Get mouse/touch position normalized (0.0 to 1.0)
  function getNormalizedPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Calculate position inside canvas
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Normalize based on canvas display size
    return {
      x: x / rect.width,
      y: y / rect.height
    };
  }

  function startDrawing(e) {
    // If e is a touch event, prevent scrolling
    if (e.touches) {
      e.preventDefault();
    }
    // Check if drawing is allowed (only drawer during drawing phase)
    const settings = getDrawingSettings();
    if (settings.canDraw === false) return;
    isDrawing = true;
    currentPoints = [getNormalizedPos(e)];
    
    // Draw initial dot
    drawCurrentStrokeLocal(true);
  }

  function draw(e) {
    if (!isDrawing) return;
    if (e.touches) {
      e.preventDefault();
    }
    
    const pos = getNormalizedPos(e);
    // Add point only if it moved slightly to prevent duplicate entries
    const lastPos = currentPoints[currentPoints.length - 1];
    if (!lastPos || Math.abs(lastPos.x - pos.x) > 0.001 || Math.abs(lastPos.y - pos.y) > 0.001) {
      currentPoints.push(pos);
      drawCurrentStrokeLocal(false);
    }
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentPoints.length > 0) {
      const settings = getDrawingSettings();
      onStrokeComplete({
        points: currentPoints,
        color: settings.color,
        width: settings.width,
        isEraser: settings.isEraser || false
      });
    }
    currentPoints = [];
  }

  // Draw current active stroke locally in real-time
  function drawCurrentStrokeLocal(isNewStroke = false) {
    if (currentPoints.length === 0) return;
    const settings = getDrawingSettings();
    const rect = canvas.getBoundingClientRect();
    
    // Use canvas coordinates, not display coordinates
    const W = canvas.width;
    const H = canvas.height;
    
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (settings.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = settings.width * (W / 600); // scale relative to reference width (600)
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = settings.color;
      ctx.lineWidth = settings.width * (W / 600); // scale relative to reference width (600)
    }
    
    ctx.beginPath();
    if (isNewStroke || currentPoints.length === 1) {
      const pt = currentPoints[0];
      ctx.moveTo(pt.x * W, pt.y * H);
      ctx.lineTo(pt.x * W, pt.y * H);
    } else {
      // Draw ONLY the last segment!
      const p1 = currentPoints[currentPoints.length - 2];
      const p2 = currentPoints[currentPoints.length - 1];
      ctx.moveTo(p1.x * W, p1.y * H);
      ctx.lineTo(p2.x * W, p2.y * H);
    }
    
    ctx.stroke();
    ctx.restore();
  }

  // Bind mouse events
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDrawing);

  // Bind touch events
  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  window.addEventListener('touchend', stopDrawing);
  window.addEventListener('touchcancel', stopDrawing);

  // Cleanup helper
  return () => {
    canvas.removeEventListener('mousedown', startDrawing);
    canvas.removeEventListener('mousemove', draw);
    window.removeEventListener('mouseup', stopDrawing);
    
    canvas.removeEventListener('touchstart', startDrawing);
    canvas.removeEventListener('touchmove', draw);
    window.removeEventListener('touchend', stopDrawing);
    window.removeEventListener('touchcancel', stopDrawing);
  };
}

// Redraw all strokes on canvas (for viewing and synced drawing)
export function drawStrokes(canvas, strokes) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, W, H);
  
  strokes.forEach(stroke => {
    if (!stroke.points || stroke.points.length === 0) return;
    
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (stroke.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = stroke.width * (W / 600); // scale relative to reference width
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width * (W / 600); // scale relative to reference width
    }
    
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * W, stroke.points[0].y * H);
    
    for (let i = 1; i < stroke.points.length; i++) {
      const pt = stroke.points[i];
      ctx.lineTo(pt.x * W, pt.y * H);
    }
    
    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0].x * W, stroke.points[0].y * H);
    }
    
    ctx.stroke();
    ctx.restore();
  });
}

// Sync strokes from database matching a specific round version
export function syncIncomingStrokes(version, onStrokesReceived) {
  if (strokesUnsubscribe) {
    strokesUnsubscribe();
    strokesUnsubscribe = null;
  }

  if (!version) return;

  const q = query(
    collection(db, 'doodleStrokes'),
    where('version', '==', version)
  );

  strokesUnsubscribe = onSnapshot(q, (snapshot) => {
    const strokes = [];
    snapshot.forEach(doc => {
      strokes.push(doc.data());
    });
    // Sort in-memory to avoid composite index requirements
    strokes.sort((a, b) => a.createdAt - b.createdAt);
    onStrokesReceived(strokes);
  });

  return () => {
    if (strokesUnsubscribe) {
      strokesUnsubscribe();
      strokesUnsubscribe = null;
    }
  };
}

// Push a completed stroke to Firestore
export async function pushStrokeToDb(strokeData, version) {
  try {
    await addDoc(collection(db, 'doodleStrokes'), {
      ...strokeData,
      version: version,
      createdAt: Date.now() // local high-resolution numeric order
    });
  } catch (err) {
    console.error('Error saving stroke:', err);
  }
}

// Clear all strokes for a given version in Firestore
export async function clearStrokesInDb(version) {
  if (!version) return;
  try {
    const q = query(
      collection(db, 'doodleStrokes'),
      where('version', '==', version)
    );
    const snap = await getDocs(q);
    const promises = [];
    snap.forEach(doc => {
      promises.push(deleteDoc(doc.ref));
    });
    await Promise.all(promises);
  } catch (err) {
    console.error('Error clearing strokes in DB:', err);
  }
}

