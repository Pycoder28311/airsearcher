General:
I want you to first read and follow the project instructions, then create reusable styles for the reusable components of the project, as specified in those instructions. dont edit the framework code as the instructions folder specify. in this whole plan no need to use the backend at all. it will only use localstorage and UI as specified below. 
i want the new files and functions and coponents organised, not too big files etc.

The visual style should use light gray shades, similar to the aesthetic of Notion, with orange and blue as secondary/accent colors.

For this project, I do **not** want to use the backend yet. Do not delete, modify, or remove any existing backend code; simply do not use or connect to it for now.

I also want all variations of the reusable component styles you create to be displayed on the main page so I can review and compare every component variation.

Remove the existing elements from the main page and replace them with the component/style variations described above.

**Do not change anything else in the project.**

I want to understand and follow the instructions of this framework before making changes to the project.

The purpose of this project is to build an organizer for group airplane flights using SerpAPI.

### Current Scope

For now, **do not use the backend or authentication at all**. This phase is focused exclusively on the UI and frontend structure.

Do not delete or remove any existing backend or authentication code. Simply do not use or connect to those systems at this stage.

### Final Project Goal

The final application will find the best flight combinations for a tourist group traveling to a desired destination.

The group will depart from Greece, with Athens as the primary departure airport. The user should be able to specify how many passengers will depart from each of the following airports:

* Athens
* Thessaloniki
* Heraklion

The application should then determine the best way for the entire group to reach the destination based on the user's selected filters and preferences.

### Group Flight Logic

Passengers departing from Thessaloniki or Heraklion should have the option/preference to first travel to Athens and then have the entire group depart together from Athens to the final destination.

The application should compare this option against having passengers from Thessaloniki or Heraklion travel directly from their respective airports to the destination.

The goal is to determine which option is better for the group based on the project's filtering and weighting logic.

If routing passengers through Athens is not practical or does not satisfy the selected filters, the application should allow them to travel directly from their respective airports to the destination.

These options should be evaluated separately so that the application can determine which overall arrangement is better.

### Filtering and Scoring Logic

The filters should follow the existing logic used in:

`dimitris/coding/workingon/serpAPI`

Use the existing project's logic for evaluating and weighting factors such as **cost, travel time, and other relevant criteria**.

Do not invent a different weighting system. The existing logic should be treated as the reference for how flight options are evaluated.

I also want to add an option that allows the user to specify whether the calculation should include **return flights** or **one-way flights only**.

### SerpAPI Usage

A major requirement is to minimize the number of SerpAPI searches required to produce the results.

I am using the **free tier of SerpAPI**, so API usage needs to be treated as a limited resource.

The implementation should:

* Avoid unnecessary searches.
* Reuse results whenever possible.
* Avoid making duplicate or redundant requests.
* Design the search strategy so that the minimum number of SerpAPI requests is required to calculate the necessary flight combinations.
* Consider how the different group-routing possibilities can be evaluated efficiently without repeatedly querying the same flight information.

Do not implement backend/API functionality yet in this phase. For now, use these requirements to understand and plan the UI and frontend structure that will eventually support this functionality.

UI:
I want to look at the existing Penpot project and use it as the design reference. The UI should follow the design specified there.

For now, the project should contain **only two pages**:

* Home
* Results

Do not create any other pages.

### Home Page

The Home page should contain the main flight-search interface and the history of previous searches.

The history of previous results should appear on the Penpot board **below the main inputs**.

When the user opens a previous search, they should be taken to its Results page and see the results associated with that search.

If a previous result was calculated more than one day ago, show a **top-right alert modal** informing the user that the results need to be recalculated using SerpAPI.

The one-day threshold must **not be hardcoded**. It should be defined through a reusable `const` so I can change it easily later.

If the current input values and dates match a previous search and the existing results are still within the reusable-results time threshold, **reuse those results instead of making new SerpAPI requests**.

### Main Flight Inputs

The main flight-search input should look and behave like the standard Google Flights input, with the changes described below.

#### Destination

The destination input should follow the Google Flights-style interface.

On the Results page, when destinations are displayed, each destination city should have an **arrow on the right side of its name**.

Clicking this arrow should open a **right-side modal** containing:

* The airports belonging to that city.
* A multiple-selection interface.
* A **Select All** button.
* All airports should be selected by default.

#### Departure

Do **not** create a standard flight-app departure input.

Instead, create a **Departure dropdown button**.

The dropdown should contain:

* The three initially relevant Greek departure cities/airports:

  * Athens
  * Thessaloniki
  * Heraklion
* The ability to add airports.
* The ability to remove airports.
* A button to find/select the **most preferred airport for the entire group**.

A list of Greek airports will be required for this functionality.

### Advanced Date Search

The date selection should also have an **advanced option** for searching across a large range of dates.

For example, the user should be able to search across approximately one month while specifying a fixed trip duration.

In this mode:

1. The user selects the possible going-date range.
2. The user specifies the trip duration in days.
3. The code will search the flights **separately for each possible departure date**.
4. At the end, the results for all dates should be ordered using the same filters and weighting logic applied to the individual flight results.

There should be a **calendar modal** for configuring this advanced date search.

The calendar should allow the user to:

* Choose the date/range in which the trip can start.
* Specify dates that should be excluded.
* Give higher priority to certain dates.

The calendar functionality should also be available from the **filter sidebar**, so the user can modify date priorities and exclusions after the initial search.

### Destination and Airport Map

There should be a **map modal** for selecting destinations and airports.

The map modal should open when the user clicks **Map** on a destination result in the destination list.

The same map functionality should exist for the airport results belonging to each city.

For now, populate the map with some **European sample cities and airports**. I will replace/expand this data later.

#### Map Interaction

The map should display:

* Cities as clickable dots.
* Airports as clickable dots.
* Airports should **disappear when zoomed sufficiently far out** so the map does not become cluttered.
* When zooming into an area, the user should be able to select a city, which represents **all airports in that city**.
* The user should also be able to select multiple airports, but **only within the same city**.

If the user has selected an airport from one city and then selects an airport from another city, the previous city's airport selection should be deselected.

This means airport multi-selection is restricted to airports belonging to the currently selected city.

#### Map Search

At the top of the map modal, include a search input for airports and cities.

This search input should follow the same interaction/design as the **destination input used in the main flight interface**.

There should also be a button that allows the user to **submit/confirm the currently selected airports**.

### Design Reference

Use the existing **Penpot project as the primary visual reference** for all of these interfaces.

The goal is to reproduce the intended design and interaction patterns from Penpot while implementing the functionality described above.

For now, these requirements are for the **UI and frontend structure only**. Do not introduce backend, authentication, or live SerpAPI functionality yet.


Result page:
### Result Modals

Each result modal will have **two states**:

* **Closed state**
* **Open state**

Both states are already described in the Penpot board and should follow the designs specified there.

The **open state** should contain more detailed information and graphs, as shown in Penpot.

### See Flights

The open result state should also include a **"See Flights" button**.

When clicked, it should display a list containing all the individual flight objects belonging to that result.

The flights should be displayed in this order:

1. Going flights
2. Returning flights

The list should contain all relevant flight objects for the result.

### Open/Close All Results

Add a button above the results that allows the user to change the state of all result modals at once.

The button should provide the ability to:

* Make **all result modals closed**, or
* Make **all result modals open**.

### Sort By

The **"Sorted by"** control should be changed from multiple buttons displayed in a row into a **dropdown menu**.

The dropdown should contain the available sorting options.

For the **"Cheapest first"** sorting option, the dropdown should also display the **price of the cheapest result** next to the option.

### Movable Result Modals

I also want each result object to have a button that allows the user to turn that result into a **movable/floating modal**.

When this mode is activated, the user should be able to:

* Drag the result modal with the mouse.
* Move it anywhere on the screen.
* Place multiple result modals next to each other.
* Compare multiple results side by side.
* Resize each result modal to whatever size the user wants.
* Position each result modal independently.

The user should have complete control over the **position and size** of each dragged result.

### Dragged Result Behavior

Once a result is turned into a dragged/floating result:

* Its original position in the results list should become **unclickable/inactive**.
* The result should exist only as a **floating modal**.
* The floating modal should have a button that allows the user to **undrag/restore** the result.

The purpose of this mode is to let the user temporarily take results out of the normal results flow and arrange multiple results freely on the screen for comparison.


Filter Sidebar:
### Filter Sidebar

The filter sidebar should follow the existing design and functionality of the **`serpAPItest` project**, with the changes described below.

### Round Trip Filter Behavior

If the selected trip type is **Round Trip**, some filters should have a **dropdown in the top-right corner**.

This dropdown should contain:

* Both flights
* Going
* Returning

The selected option indicates **which flight(s) the specific filter should be applied to**.

For example, the user should be able to apply a filter only to the going flight, only to the returning flight, or to both.

### Trip Type

Remove the **Multi City** trip type from the filter.

Only the supported trip types should remain.

### Departure and Arrival Times

For the **Departure Times** filter, add equivalent options for **Arrival Times**.

Both should be configurable independently, but when one is changed, the other should **automatically use the corresponding value by default**.

### Avoid Airports

Update the **Avoid Airports** filter so that the user can:

* Select multiple airports.
* Use a **Select All** button.

### Departure Airports

Add a new filter for configuring the **departure airports**.

This filter should provide the same airport editing functionality as the main search interface, allowing the user to:

* Add airports.
* Remove airports.
* Edit the selected airports.

Additionally, this filter should allow the user to specify **which airport should be preferred as the gathering airport for the entire group**.

### Price and Time Weights

For both the **Price** and **Hours/Time** filters, add a five-level weighting system.

The available values should be:

1. None
2. A little
3. Mid
4. Much
5. Completely

These weights should follow the existing project's weighting logic.

### Departure vs. Arrival Weight

Remove the **Departure vs. Arrival weight** filter entirely.

### Filter Order

Move the **Hour Preferences** filter so that it appears **above the Airlines** filter in the sidebar.

### Reset Filters

Add a **Reset All Filters** button at the bottom of the filter sidebar.

This button should reset all currently configured filters to their default values.

### Sidebar Visibility

The filter sidebar should be **collapsible**.

The user should be able to:

* Close/hide the sidebar.
* Reopen/show the sidebar when needed.

The sidebar's open and closed states should be properly handled in the UI without affecting the current search results or filter values.
