import { AirplaneTracker } from "@/components/AirplaneTracker";
import Chat from "@/components/Chat";
import Graphs from "@/components/Graphs";
import Tasks from "@/components/Tasks";

export default function Home() {
  return (
    <main className="h-screen w-screen grid grid-rows-[1fr_3fr] grid-cols-4">
      {/* Graphs: Top 1/4, full width */}
      <div className="col-span-4 row-span-1">
        <Graphs />
      </div>
      
      <div className="col-span-3 row-span-1">
        <AirplaneTracker />
      </div>
      <div className="col-span-1 row-span-1">
        <Tasks />
      </div>
    </main>
  );
}
