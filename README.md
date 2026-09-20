# 🥫 PantryTwin

### Location intelligence for smarter food-access planning.

PantryTwin is an interactive decision-support platform that helps nonprofits explore where a new food pantry can expand community reach and how that location could perform operationally.

Select a point anywhere on the Baltimore City map and PantryTwin creates a digital planning twin of that location. It combines geographic coverage, nearby food resources, Census demographics, poverty indicators, environmental intelligence, operational simulations, and AI-assisted analysis in one experience.

Instead of reviewing maps, spreadsheets, demographic datasets, and operational assumptions separately, organizations can explore them together through a single location-based assessment.

> **Choose a location → understand the community → model the operation → turn the analysis into action.**

---

## 🏆 HopHacks Prize Targets

PantryTwin focuses on one primary track while integrating sponsor technologies directly into the product.

| Selection | Role in PantryTwin |
| --- | --- |
| **Bloomberg — Most Philanthropic Hack** | PantryTwin gives nonprofits a data-driven way to explore where food-access resources can create additional community reach and how a proposed pantry could operate under different demand levels. |
| **Gemini API** | Powers the server-side conversational assistant that explains location evidence, coverage, scenarios, operational results, and sourced findings. |
| **Auctor — Conversation to Action** | Converts the current assessment and user questions into an actionable, downloadable planning report. |
| **GoDaddy** | Provides the custom domain for PantryTwin and creates a public-facing home for nonprofit organizations, community partners, and future users. |
| **Open Environmental Intelligence** | Adds environmental context to location intelligence so community conditions can be explored alongside food access, demographics, and geographic coverage. |

The application is deployed through **Vercel** directly from the GitHub repository.

---

# 💡 The Problem

Food insecurity is deeply connected to geography.

When an organization considers opening a new pantry, the location raises several planning questions:

- How many people live within reach?
- How much of that population already falls within the reach of another listed pantry?
- Where could a new location add geographic coverage?
- How many food-access resources already operate nearby?
- What are the demographic and economic characteristics of the surrounding community?
- What environmental conditions shape the area?
- How many households could the pantry serve with a particular operating plan?
- Which operational resource becomes the main constraint as demand changes?
- How would the system change after adding a new location?

PantryTwin brings these questions into one interactive model.

---

# 🗺️ Map Intelligence

The **Map** is the primary exploration workspace.

Users place a proposed pantry directly on the map and immediately receive a location-specific assessment.

PantryTwin combines multiple geographic layers including:

- proposed pantry locations
- listed food pantries
- Maryland Food Bank locations
- Census tract geography
- population information
- poverty indicators
- placement scoring
- environmental intelligence
- selected-site catchments
- nearby food-access services

Users can enable and disable layers to explore the community from different perspectives.

---

## 📍 Interactive Site Selection

A proposed pantry can be positioned directly on the map.

The selected point becomes the center of the analysis and updates the surrounding statistics, coverage calculations, placement information, nearby resources, operational scenarios, and AI context.

This makes PantryTwin useful for rapid **what-if location exploration**.

Move the pin and the digital planning twin changes with it.

---

# 🎯 Placement Intelligence

PantryTwin calculates a **placement score** for the selected location.

The score combines location-level planning signals such as:

- population
- poverty
- geographic reach
- nearby food resources
- vehicle-access information when available
- overlap with listed pantry coverage

The interface presents the score spatially so users can explore how conditions vary across Baltimore.

Each value maintains its provenance classification so users can distinguish public data, calculated estimates, and planning assumptions.

---

# 📐 Adjustable Catchment Analysis

Users control the assumed straight-line catchment radius around the proposed pantry.

For example:

**1.2 km assumed straight-line ring**

The radius can be adjusted directly from the Map interface.

PantryTwin intersects the selected catchment with Census tract geography and estimates the population represented inside the ring.

For every intersecting tract:

**Estimated population inside catchment**

`tract population × percentage of tract area inside catchment`

This produces an area-weighted estimate rather than assigning the entire population of every intersected tract to the proposed pantry.

---

# 👥 Coverage Intelligence

The Statistics panel explains the geographic reach of the selected location.

Metrics include:

- people within the selected ring
- people already inside a listed pantry ring
- people outside every listed pantry ring
- nearby listed services
- poverty rate
- geographic overlap
- net-new geographic reach

For the example assessment shown in PantryTwin:

- **28,086 people** are represented within the selected 1.2 km catchment
- **37 listed services** are nearby
- the surrounding poverty rate is **28.5%**
- the model identifies how much of the catchment overlaps existing listed pantry coverage

This transforms a map pin into measurable community context.

---

# 🔄 Coverage vs. Duplication

A central question PantryTwin answers is:

> **Would opening here add geographic coverage, or duplicate an area already within reach of a listed pantry?**

The system compares the proposed catchment against catchments surrounding existing pantry listings.

It separates:

**Net-new reach**  
Population represented outside existing listed pantry rings.

**Duplicated reach**  
Population represented within both the proposed ring and an existing listed pantry ring.

This gives organizations a clearer view of how a proposed site fits into the existing food-access landscape.

---

# 🥫 Nearby Food Resources

Public food-resource locations appear directly on the map.

PantryTwin can display:

- listed pantries
- Maryland Food Bank locations
- food-access resources
- selected comparison sites

Users can visually explore the relationship between a proposed pantry and the surrounding food-support ecosystem.

PantryTwin treats these locations as community resources and uses their published geographic presence to understand existing coverage.

---

# 📊 Statistics Panel

Selecting a location opens a detailed statistics workspace containing three major areas:

### Findings

A plain-language interpretation of the selected location.

Example:

> Everyone in this catchment already has a listed pantry within 1.2 km.

### Coverage

Displays metrics such as:

- net-new geographic reach
- total people in the ring
- people already inside a listed pantry ring
- nearby listed services
- poverty rate

### Plan

Shows the modeled operational outcome for the proposed pantry under the selected demand scenario.

---

# 📈 Three Demand Scenarios

PantryTwin evaluates the proposed pantry under three planning assumptions:

**LOW · MEDIUM · HIGH**

Each scenario represents a different assumed level of household requests.

Running all three gives planners a range of operating conditions to explore.

The model reports metrics including:

- assumed weekly household requests
- household visits served
- service rate
- cost per household
- operational limits
- resource utilization

The scenario selector makes it possible to move between demand assumptions instantly.

---

# ⚙️ 28-Day Operational Twin

PantryTwin creates a deterministic **28-day operational simulation** for the proposed pantry.

The simulation models the interaction between:

- food intake
- storage
- inventory
- shelf life
- spoilage
- household requests
- household visits
- volunteer throughput
- delivery capacity
- operating cost

Each simulation begins with the operating assumptions selected for the proposed location.

Every day the model processes inventory, incoming food, available capacity, household demand, and distribution.

Food is distributed using a **first-expiring-first** strategy.

---

# 🚦 Operational Constraint Detection

PantryTwin identifies the resource shaping the pantry's ability to serve additional households.

Examples include:

- food on hand
- storage capacity
- volunteer throughput
- delivery capacity

The Statistics panel communicates both the limiting resource and when it becomes active during the 28-day simulation.

This helps planners understand how operational changes could affect service capacity.

---

# 📉 Demand Scenario Visualization

The Map statistics panel includes a visualization comparing visits served under:

- Low demand
- Medium demand
- High demand

This provides an immediate view of how the same pantry plan behaves as assumed community participation changes.

---

# 📊 PantryTwin Analytics

The **Analytics** workspace expands the application from a single-location map into a broader operational planning dashboard.

It compares two modeled states:

## 01 — Baseline

**Simulation without the proposed new location**

The baseline represents the current modeled system.

## 02 — Expansion

**Simulation with the location selected from the Map**

The expansion model incorporates the proposed pantry into the scenario.

Displaying these views side-by-side makes it possible to explore how adding a location changes modeled food distribution and service activity.

---

# 📦 Food Analytics

PantryTwin tracks major food-flow metrics including:

- pounds distributed
- pounds received
- pounds discarded
- inventory movement

Interactive time-series charts display:

**Distributed · Received · Discarded**

Users can inspect individual periods and see the corresponding values directly on the visualization.

The dashboard also displays changes between modeled periods to make trends easy to interpret.

---

# 👨‍👩‍👧 People Analytics

The Analytics workspace tracks:

- clients
- households
- staff

These metrics are visualized over time for both the baseline and expansion models.

Interactive chart inspection allows users to explore how service activity and staffing evolve across the modeled timeline.

---

# 🔮 Baseline and Expansion Modeling

The Analytics interface places the two scenarios side-by-side:

| Baseline | Expansion |
| --- | --- |
| Current modeled system | System with the proposed Map location |
| Food distributed | Food distributed |
| Food received | Food received |
| Food discarded | Food discarded |
| Clients | Clients |
| Households | Households |
| Staff | Staff |
| Food-security indicators | Food-security indicators |

This creates a **digital twin comparison** between the current modeled environment and a proposed expansion.

---

# 🕒 Historical and Forecast Views

The analytics interface supports time-oriented exploration across historical and modeled future periods.

The dashboard distinguishes periods visually and allows users to inspect individual months through interactive charts.

This creates a planning environment where organizations can explore how the modeled system evolves over time and how a proposed location changes that trajectory.

---

# 🌎 Environmental Intelligence

PantryTwin brings **Open Environmental Intelligence** into the location assessment.

Environmental context becomes another layer of community intelligence alongside:

- food access
- population
- poverty
- transportation access
- existing pantry coverage
- operational capacity

This helps organizations view food-access planning through a broader community-resilience lens.

Environmental indicators remain visible as their own evidence layer so organizations can understand exactly how they contribute to the assessment.

---

# 🤖 Gemini AI Assistant

PantryTwin includes an AI assistant powered by the **Gemini API**.

Users can ask natural-language questions such as:

> Would opening here add coverage?

> How many listed pantries are near this location?

> What does this location tell us about community need?

> Compare this location with the nearby pantry.

> What happens under high demand?

> Which operational resource is limiting service?

The assistant receives the current assessment and explains the results conversationally.

---

## 🛡️ Grounded AI Architecture

Gemini works as an **interpretation layer** over PantryTwin's analysis.

The server provides approved analysis functions:

```text
get_location_evidence
compare_locations
get_scenario_results
summarize_limitations
