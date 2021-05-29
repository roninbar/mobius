import React, { useEffect, useRef } from 'react'
import './App.scss'

function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const gl = canvas.current?.getContext('webgl');
    if (!gl) {
      return;
    }
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  });
  return (
    <div className="App">
      <header className="App-header">
        <canvas width="320px" height="320px" ref={canvas} />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a className="App-link" href="https://github.com/EliEladElrom/react-tutorials" target="_blank" rel="noopener noreferrer">
          Eli Elad Elrom - React Tutorials
        </a>
      </header>
    </div>
  )
}

export default App
