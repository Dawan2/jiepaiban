import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { FrameImagesProvider } from './store/FrameImagesProvider';
import { ProjectsProvider } from './store/ProjectsProvider';
import './styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root not found');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      {/* 图片仓在外层：删项目时 ProjectsProvider 要顺手清掉该项目的参考图。 */}
      <FrameImagesProvider>
        <ProjectsProvider>
          <App />
        </ProjectsProvider>
      </FrameImagesProvider>
    </BrowserRouter>
  </StrictMode>,
);
