import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import TimerPage from './pages/Timer';
import TodoPage from './pages/Todo';
import MemoPage from './pages/Memo';
import AIPage from './pages/AI';
import SettingsPage from './pages/Settings';
import CreatePage from './pages/Create';
import LoginPage from './pages/Login';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/timer" element={<TimerPage />} />
          <Route path="/todo" element={<TodoPage />} />
          <Route path="/memo" element={<MemoPage />} />
          <Route path="/ai" element={<AIPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/timer" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
