import { AppSidebar as Sidebar } from "@/components/Sidebar";

const Index = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 pl-60 p-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Selecione um dashboard no menu lateral
        </p>
      </main>
    </div>
  );
};

export default Index;
