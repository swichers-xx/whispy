import CloudFunctionDemo from '../components/CloudFunctionDemo';

export default function CloudFunctionsPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Google Cloud Functions Demo
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg">
            Interact with serverless functions deployed on Google Cloud
          </p>
        </div>
        
        <div className="mt-10">
          <CloudFunctionDemo />
        </div>
        
        <div className="mt-12 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">About Cloud Functions</h2>
          <p className="mb-4">
            Google Cloud Functions is a serverless execution environment for building and connecting cloud services.
            With Cloud Functions you write simple, single-purpose functions that are attached to events emitted from your cloud infrastructure and services.
          </p>
          <p className="mb-4">
            Your function is triggered when an event being watched is fired. Your code executes in a fully managed environment.
            There is no need to provision any infrastructure or worry about managing any servers.
          </p>
          <h3 className="text-lg font-medium mt-6 mb-2">Types of Cloud Functions:</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>HTTP Functions</strong> - Triggered by HTTP requests</li>
            <li><strong>Background Functions</strong> - Triggered by cloud events (Pub/Sub, Cloud Storage, etc.)</li>
            <li><strong>Callable Functions</strong> - Called directly from your app using the Firebase SDK</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
