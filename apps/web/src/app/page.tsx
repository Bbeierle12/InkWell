import { Editor } from '@/components/Editor';
import { Toolbar } from '@/components/Toolbar';
import { BackpressureIndicator } from '@/components/BackpressureIndicator';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <Toolbar />
      <BackpressureIndicator />
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8">
        <Editor />
      </div>
    </main>
  );
}
