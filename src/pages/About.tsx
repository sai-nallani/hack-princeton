import { Link } from "react-router-dom";

export default function About() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold mb-8">About This Boilerplate</h1>

        <div className="space-y-4 text-lg">
          <p>
            This is a modern React boilerplate featuring:
          </p>

          <ul className="list-disc list-inside space-y-2">
            <li>React 18 with modern hooks</li>
            <li>TypeScript for type safety</li>
            <li>Vite for fast development and building</li>
            <li>React Router for navigation</li>
            <li>Tailwind CSS for styling</li>
            <li>ESLint for code quality</li>
            <li>Organized folder structure</li>
          </ul>

          <div className="mt-8">
            <Link
              to="/"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
