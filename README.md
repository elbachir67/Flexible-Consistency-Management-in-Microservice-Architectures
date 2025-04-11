# Megamodel-Based Consistency Management Simulator

This interactive simulator demonstrates the concepts presented in the research paper "Flexible Consistency Management in Microservice Architectures through Megamodel-Based State Transition Rules." It showcases the extended MSI (Modified-Shared-Invalid) protocol with differentiated Shared states for managing consistency in distributed microservice architectures.

## Key Features

- **Interactive Microservice Architecture Visualization**: Visualizes multiple microservices (OrderService, PaymentService, InventoryService) with their component models
- **Extended MSI State Transitions**: Demonstrates the four consistency states (Modified, Shared+, Shared-, Invalid)
- **Multiple Consistency Types**: Showcases different consistency types (Strong, Eventual, Bounded Staleness, Monotonic Reads, Read-My-Writes)
- **Global Operation Models (GOMs)**: Visualizes the concept of GOMs from the paper
- **E-Commerce Scenario**: Step-by-step simulation of the e-commerce ordering scenario from Table 3 in the paper
- **Bounded Staleness Demo**: Specific functionality to demonstrate bounded staleness behavior
- **Comprehensive Transition History**: Tracks all state transitions with detailed explanations

## Getting Started

1. Clone the repository
2. Install dependencies with `npm install`
3. Run the development server with `npm run dev`
4. Open your browser to the displayed URL (typically http://localhost:5173/)

## How to Use the Simulator

### Main E-Commerce Scenario

1. **Step-by-Step Execution**: Click the "Next Scenario Step" button to advance through the e-commerce scenario
2. **Auto Mode**: Click "Start Auto Mode" to automatically step through the scenario
3. **Reset**: Click "Reset System" to restart the simulation

### Bounded Staleness Demo

After completing the main scenario (or at any time):

1. Click "Setup Bounded Staleness Demo" to prepare the system for demonstration
2. Use the buttons in the Bounded Staleness Demo panel:
   - "Demonstrate Timeout (s- → i)" to show the component becoming invalid when staleness bound is exceeded
   - "Demonstrate Refresh (i → s+)" to show how refreshing restores the component to Shared+ state

### Manual Operation Control

Use the Operation Controls panel to manually apply operations:

1. Select a service and component
2. Choose an operation (update, share, refresh, timeout, read)
3. Set whether this is a source operation
4. Click "Apply Operation"

## Understanding the Interface

### Microservices Panel

Shows the services and their components with:

- Color-coded state indicators (Modified, Shared+, Shared-, Invalid)
- Consistency type information (sc, ec, bs, mr, rmw)
- Version numbers

### Megamodel Panel

Displays the central megamodel that tracks:

- Component states across services
- Consistency types
- Metadata like versions and timestamps
- Alerts for components requiring attention

### GOMs (Global Operation Models)

Shows the Global Operation Models:

- GOM1: Order Processing
- GOM2: Product Search
- Components and their consistency requirements

### State Transition Table

Based on Table 3 from the paper, shows the current state of components across all services.

### Transition History

Records all state transitions with:

- Timestamps
- Services and components involved
- Operations applied
- State changes
- Detailed descriptions

## Technical Implementation

This simulator is built with:

- React + TypeScript
- State management using React hooks
- Transition rules closely following the paper's formalization

## Research Paper Reference

This simulator is based on research presented in "Flexible Consistency Management in Microservice Architectures through Megamodel-Based State Transition Rules" by El Hadji Bassirou TOURE, Ibrahima FALL, Mandicou BA, and Alassane BAH.

## License

[MIT License](LICENSE)
