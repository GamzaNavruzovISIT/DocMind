import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { analyzeEntities, getDocument, getEntities } from '@/lib/api';
import type { DocumentFull, EntityItem, EntityType } from '@/types';
import { ENTITY_TYPES } from '@/lib/entity-meta';
import { DocumentViewer } from '@/components/DocumentViewer';
import ChatPanel from '@/components/ChatPanel';
import EntitiesPanel from '@/components/EntitiesPanel';
import ExtractPanel from '@/components/ExtractPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { toast } from 'sonner';

export default function DocWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentFull | null>(null);
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [activeTypes, setActiveTypes] = useState<Set<EntityType>>(
    () => new Set(ENTITY_TYPES),
  );
  const [jumpOffset, setJumpOffset] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const loadEntities = useCallback(() => {
    if (!id) return;
    getEntities(id).then(setEntities).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let stop = false;
    const load = () =>
      getDocument(id)
        .then((d) => {
          if (stop) return;
          setDoc(d);
          if (d.status === 'processing') setTimeout(load, 2500);
        })
        .catch(() => setNotFound(true));
    load();
    loadEntities();
    return () => {
      stop = true;
    };
  }, [id, loadEntities]);

  const toggleType = useCallback((type: EntityType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const jump = useCallback((offset: number) => {
    setJumpOffset(null);
    requestAnimationFrame(() => setJumpOffset(offset));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!id || analyzing) return;
    setAnalyzing(true);
    try {
      const res = await analyzeEntities(id);
      toast.success(`Найдено сущностей: ${res.count}`);
      loadEntities();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }, [id, analyzing, loadEntities]);

  if (notFound) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <div className="font-medium">Документ не найден</div>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />К списку документов
        </Button>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const viewer = (
    <DocumentViewer
      doc={doc}
      entities={entities}
      activeTypes={activeTypes}
      jumpOffset={jumpOffset}
      onEntityClick={(e: EntityItem) => jump(e.startOffset)}
      onAnalyze={handleAnalyze}
      analyzing={analyzing}
      onEntitiesChanged={loadEntities}
    />
  );
  const chat = (
    <ChatPanel documentId={doc.id} docReady={doc.status === 'ready'} onSourceClick={jump} />
  );
  const entitiesPanel = (
    <EntitiesPanel
      entities={entities}
      activeTypes={activeTypes}
      onToggleType={toggleType}
      onJump={jump}
    />
  );
  const extract = (
    <ExtractPanel
      documentId={doc.id}
      docReady={doc.status === 'ready'}
      docTitle={doc.title}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
      <div className="hidden min-h-0 flex-1 lg:block">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={58} minSize={35}>
            <div className="h-full border-r border-border bg-card/40">{viewer}</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={42} minSize={26}>
            <Tabs defaultValue="chat" className="flex h-full flex-col">
              <TabsList className="mx-3 mt-2.5 grid w-auto grid-cols-3">
                <TabsTrigger value="chat" className="min-h-[36px]">Чат</TabsTrigger>
                <TabsTrigger value="entities" className="min-h-[36px]">Сущности</TabsTrigger>
                <TabsTrigger value="extract" className="min-h-[36px]">Извлечение</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="mt-0 min-h-0 flex-1">{chat}</TabsContent>
              <TabsContent value="entities" className="mt-0 min-h-0 flex-1">{entitiesPanel}</TabsContent>
              <TabsContent value="extract" className="mt-0 min-h-0 flex-1">{extract}</TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="flex items-center gap-1 border-b border-border bg-sidebar-background px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</div>
        </div>
        <Tabs defaultValue="doc" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-2 mt-2 grid w-auto grid-cols-4">
            <TabsTrigger value="doc" className="min-h-[40px] text-xs sm:text-sm">Документ</TabsTrigger>
            <TabsTrigger value="chat" className="min-h-[40px] text-xs sm:text-sm">Чат</TabsTrigger>
            <TabsTrigger value="entities" className="min-h-[40px] text-xs sm:text-sm">Сущности</TabsTrigger>
            <TabsTrigger value="extract" className="min-h-[40px] text-xs sm:text-sm">Поля</TabsTrigger>
          </TabsList>
          <TabsContent value="doc" className="mt-0 min-h-0 flex-1 bg-card/40">{viewer}</TabsContent>
          <TabsContent value="chat" className="mt-0 min-h-0 flex-1">{chat}</TabsContent>
          <TabsContent value="entities" className="mt-0 min-h-0 flex-1">{entitiesPanel}</TabsContent>
          <TabsContent value="extract" className="mt-0 min-h-0 flex-1">{extract}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
