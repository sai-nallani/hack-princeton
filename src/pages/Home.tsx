import { AirplaneTracker } from "@/components/AirplaneTracker";
import Graphs from "@/components/Graphs";
import Tasks from "@/components/Tasks";

export default function Home() {
  return (
    <main className="h-screen w-screen flex relative">
      {/* Left side: AirplaneTracker (3/4 width) with Graphs overlay */}
      <div className="w-3/4 h-full relative">
        <AirplaneTracker />
        {/* Graphs overlay on top of AirplaneTracker */}
        <div className="absolute top-0 left-0 w-full z-10">
          <Graphs />
        </div>
      </div>
      
      {/* Right side: Tasks (1/4 width) */}
      <div className="w-1/4 h-full">
        <Tasks />
      </div>
    </main>
  );
}
