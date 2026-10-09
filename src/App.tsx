import { Routes, Route } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import AppLayout from '@/components/AppLayout';
import Home from '@/pages/Home';
import DocWorkspace from '@/pages/DocWorkspace';
import Templates from '@/pages/Templates';
import Settings from '@/pages/Settings';

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/doc/:id" element={<DocWorkspace />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
      <Toaster richColors position="bottom-right" />
    </>
  );
}
