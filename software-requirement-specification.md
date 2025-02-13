# Software Requirement Specification(SRS)

This is the SRS for a **high-value link scraper with API**

## Objective

Build a web scraper that identifies high-value links on a web page, focusing on extracting relevant contacts and specific files (like "ACFR," "Budget," or related terms). The scraper can/should use an ML model, LLM, or another intelligent approach to prioritize relevant links. Additionally, provide an API to access the scraped data, using any data storage model you’d like.

## Breakdown

1. Web Scraper
    - **Goal**: Create a web scraper that identifies and prioritizes the highest-value links on a page, intelligently selecting links most likely to contain target content (e.g., contact pages, documents with keywords like "ACFR" or "Budget").
    - **Suggested Approach**:
        - Use an ML model, OpenAI API, or a custom heuristic to classify and rank links by relevance.
        - Allow adjustable keyword prioritization, focusing on terms like "Budget" or "ACFR" or “Finance Director”
        - Be thoughtful about scale You don’t have to implement necessarily but be thoughtful of what it might look like to run this crawler at millions of pages a day.
2. **Data Structuring & Storage**
    - **Goal**: Store extracted links with metadata.
    - **Requirements**:
        - Structure data to include fields like URL, type, relevance score, and keywords.
        - Simple databases like SQLite or NoSQL should be sufficient.
        - Make sure to build for scale and optimize for large quantities of data
3. **API for Accessing Scraped Data**
    - **Goal**: Develop a basic API for accessing the stored data.
    - **Requirements:**
        - Architecture and design for a well built API.
4. **Documentation**
    - **Goal**: Document your process.
    - **Include**: Setup instructions, overview of the link prioritization approach, and API usage guide.

## Important Notes

- **Requirements**: Beyond achieving the **Objective**, there are no strict requirements for frameworks or methods used. A lot of people might not finish it but prioritizing what’s important is a skill.

## Some test websites

<https://www.a2gov.org/>

<https://bozeman.net/>

<https://asu.edu/>

<https://boerneisd.net/>
