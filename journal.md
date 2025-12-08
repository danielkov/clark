## notes

Started on Kiro panel, in specs, pressed `+`. This text dialog closes when you switch tabs. I only found out after typing out the initial promp and switching tabs to double check the name of a service I wanted to use. That cost me ~15 mins.

I usually type prompts out in a separate text file. Seems like that's the workflow for Kiro too.

> ❓ It's unclear where I should start. Should I press new spec? Should I use the Cursor-style chat sidebar? What's the difference?

I added all of the required user flows in EARS notation in my prompt, so the AI didn't have to guess.

Ended up using a new chat session. It created a spec from my prompt. I glossed over it and it seemed to match my expectations, though it was mainly my initial prompt re-organised. Looks like the initial prompt is very important.

I left a list of documentation URLs in my initial prompt, which were not used in any of the steps. I think this is a mistake from Kiro. Documentation URLs like these should be respected

Keep optional tasks prompt: Kiro asked me if I want to do all tasks initially, or skip optional tasks. This is phrased a bit confusingly. I understood the concept, because I've worked with Claude Code plan mode for some time now.

I like the task list. I don't think the AI did the best job splitting it up into deliverables. My project could be split into 3 major milestones:

1. Setting up the full-stack app (NextJS)
2. Implementing linking with Linear
3. Adding AI enhancements via LiquidMetal

I like that it asks 

Instead for the initial task, it decided to set the entire environment up, including Linear and LiquidMetal. There's no real benefit to doing it this way, and it wasted about 1.5 credits on adding the features we won't get to use.

It also spent about 0.9 credits on setting up testing, when it made me agree not to add tests before the task creation phase.

Ran into this issue:

> I've been trying to use "executeBash" but it's failed 7 times in a row. I'm clearly stuck in a loop.

This would be fine, except it did run bash 7 times, but it succeeded 6 times and only failed once. I believe there's an issue in how it counts bash commands as failures. It ran 6 separate commands too, so clearly the LLM knows when it gets past a step, but there's some built in logic that catches it regardless.

It added ESLint, when it started with NextJS init, which already includes this - useless step.

Adds `.gitkeep` to empty directories, when it doesn't commit. This is a useless step.

Decides to build the empty NextJS project.

Added a completely no-op test file that defines an `add` utility and then checks if it works. Again, I asked for no tests (which it suggested during setup), why is it wasting all this effort on tests is beyond me.

Looks like it uses Claude Sonnet. I know this because of the cancer emoji spam in the ourput.

At this point we've successfully reproduced the same thing we'd get from using `npx create-next-app`, spending:

```
Credits used: 4.13
Elapsed time: 45m 41s
```

The toolbar at the bottom of the editor does not stay up to date with credit use. I'd just remove it because it's confusing.

I started Task 2.

Looks like it uses separate contexts for each tasks, because it starts each time by reading what's already available. Context angineering seems to be fully abstracted away. I'm not sure I like this. I'm pretty good at managing context and giving me more control would benefit me.

It very stupidly hand-rolled authentication (based on very outdated information), instead of just installing `"@workos-inc/authkit-nextjs"`, which handles all of this out of the box. I decided to re-write authentication to use the WorkOS-recommended setup. I know from experience that diverging from this will bite me later on.

This is where the docs I mentioned above would've helped. Kiro should prioritise including these, or even reading them and informing its implementation path based on them, when the user requests this.

Still runs tests after every task, even though they're just placeholders. Very happy that the tests pass too.

In the default dark mode in the editor, it's not apparent what files and directories are `.gitignore`d. I think this is a major security flaw.

Extraneous entries in `.env.local`, e.g.:

```
# Database Configuration (for session storage)
DATABASE_URL=
```

(we're not using a database)

Not using Prettier for a TypeScript project in 2025 is criminal. Kiro should be sent to jail for this.

Ended up just re-rolling auth from scratch, since the Kiro setup was totally unusable. Took 22 minutes for Kiro to complete its auth implementation, took me 12 minutes to delete it all and set it up using WorkOS docs.

When you have something running in the terminal, when Kiro tries to run commands, it just sends them to stdin of that process, instead of creating a new terminal. This is incredibly useless, since most everyone will want to have something running while they're working on a project.


## Linear implementation

Again, a key principle I requested was ignored. I asked for it to implement actor authentication, instead of trying to impersonate a user. This is key to making this whole project work. This is also something where I linked the docs (which were ignored).

It also based persistence on its brittle hand-rolled WorkOS integration based on updated JWTs in cookies. I decided to try vibe coding to fix this.

> At this point it's apparent that Kiro ***DOES NOT CHECK THE INTERNET***. I think this is a major flaw and it makes it close to useless at implementing anything meaningful. It does put links in comments, though, which I find funny.

Another fucky thing is that it left a MIGRATION_NOTES.md, that's almost longer than the entire code output. There's very little use in these in fully agent-driven environments. Adding legacy information for posterity can be nice for humans, but it greatly reduces the quality of output for LLMs. It also wasted a bunch of tokens on this.

I had to manually edit the implementation in a few places, because it does not check linter output and does not look up web pages. If it just followed the website I've sent it, it would've been able to one-shot this task no problem.

Vibe coding use:

```
Credits used: 2.46
Elapsed time: 4m 5s
```

## Linear onboarding

As a common theme, it once again - attempted to add completely useless tests to the tune of importing functions from other modules and checking if their type is of `"function"`. It then failed to run these tests, since it tried to import modules from auto-generated NextJS directories. It then deleted the new tests, ran the old test stubs and finally celebrated itself for making all tests pass.

It also did something it hadn't done before: it actually started building UI. This is great, because the human in the loop finally gets to interact with the app. If you check commit history, you'll see there was UI committed, however, this is just random stuff I added to allow me to test sign up and sign out end to end. Without these makeshift UIs, I'd have had no way to verify anything works until now.

Something that Claude Code does very well: it instructs you to update parts where you're missing credentials, like API keys, tokens etc. I've not seen this from Kiro yet. It has incredibly verbose output, with a lot of waffling on about what it's done, yet it omits this very important info.

I like the speed of iteration in Kiro. It's the fastest I've seen so far of any IDE-based vibe coding product. I don't think the specs are detailed enough for it to be able to delegate work like this to super-cheap models, like Claude Haiku. Then again, the quality of the output is sub-par at best, and entirely useless at worst (see the initial WorkOS integration).

Anecdotally, it could work really well, if it produced more in-depth specs. It's also very interesting how it directs itself to skip tests, yet it seems like the entire methodology behind Kiro is set up around tests, so it's constatly doing the equivalent of dangling its feet above a puddle and gloating about being an olympic swimming champion.

> I just can't place Kiro. If it's truly for vibe coders, it's nowhere near noob-friendly enough. It doesn't guide the user through the steps they need to take to make apps like this work. If it's for advanced software engineers, it's just a crappy tool. It really needs to have internet access. Without it, it's almost entirely useless.

At this point I need to acquire an app ID and token from Linear. I have no idea how to do this. Linear docs are not very forthcoming about this process. I'd expect Kiro to find this out for me and output a guide or something. I'm nervous to ask though. I know it won't search the internet, so the information will most likely be wrong. I'm at 18.37 credits used at this point. I'm afraid it won't finish this tiny project with the 50 credits I have access to.

Another thing I really hate about how Kiro set this project up, is that it adds an API route for everything. In NextJS 16, the only remaining use-case for API routes is if it needs to have a stable URL that makes it accessible for outside use-cases. Most API routes Kiro added do not meet that criteria. I don't know how to make Kiro aware of this. I'm going to try vibe coding a fix for this, because it makes the entire app logic brittle to file renames and adds needless maintenance overhead.

I've used this prompt to get it to refactor our unnecessary API routes:

```
In this project, so far you've added an API route every time you needed to fetch data for the client. In NextJS 16 the only valid use case for an API route is if we want to explicitly expose that endpoint to an outside actor. For data fetching, you should do it top-level in async function components in routes, for actions, we should create an api.ts file with "use server" that can be used to expose individual functions, that can be called from the client. Go through each API route, determine if they should be an API route. For authentication (callbacks) and webhook-related endpoint, they need to have a stable URL for third-party apps to call. For everything else, move the logic over to just server functions and remove the unnecessary API routes.
```

There's a bug I want to debug. When onboarding, as soon as it tries to create the tone of voice document, it fails, seemingly with the wrong project ID (for the initiative). I'm going to use the simplified structure that the vibe coding prompt left me with to debug this.

Kiro actually did a great job with this migration task. Everything seems to work as before and we now have server actions, instead of API routes. I'm interested to see if it's going to keep setting up API routes for future tasks. It is also by far the fastest tool I've used. I've noticed it has an unsafe file edit function. Instead of checking like Claude Code or Cursor do, it just overwrites whatever is currently in the file. This makes it not a great companion for coding alongside, but it speeds it up immensely. I like this trade-off for fully hands-off workflows.

Annoyingly, I read the code that tried to set the tone of voice document up, and it turned out it was the dumbest bug:

```ts
// Create the document
const payload = await client.createDocument({
  title: TONE_OF_VOICE_TITLE,
  content: DEFAULT_TONE_OF_VOICE_CONTENT,
  projectId: initiativeId,
});
```

Instead of:

```ts
// Create the document
const payload = await client.createDocument({
  title: TONE_OF_VOICE_TITLE,
  content: DEFAULT_TONE_OF_VOICE_CONTENT,
  initiativeId,
});
```

This clearly failed, since Linear couldn't find a project with our initiative ID. I'm so surprised it failed on something so trivial, while it set some pretty complex workflows up, including an onboarding flow that depends on multiple third-parties playing ball.

## Showing actual job listings

I've decided to edit the task list, since it was coupled to the concept of API routes. New tasks focused on building pages. The hope is that Kiro picks up on the project already being heavily built on server actions (since the refactor) and it adjusts its expectations (that produced the initial API-route oriented approach).

I can't help but follow Kiro's progress. I'm noticing a lot of usages of deprecated Linear SDK methods and attributes. About half of the properties it used weren't even available anymore. I'm going to have to fix this by hand once it's done. Interestingly it does check diagnostics, but it doesn't do much with the output and it'll happily leave them red and claim the task is done.

We don't yet have the AI enhanced workflow set up. This is fine. I'm testing the new pages Kiro set up, by creating some test projects in Linear.

The nastiest mistake it made is - again - rather than taking 2 seconds to check online what the right API is for Linear, it failed to add the right heuristic for checking project status. It cooked up a random check that's in no way accurate:

```ts
/**
 * Check if a project has "In Progress" status
 * In Linear, we check the project's progress/status
 */
async function isProjectInProgress(project: Project): Promise<boolean> {
  // Linear projects have a progress field that can be checked
  // For now, we'll use a simple heuristic based on the project's state
  // In a real implementation, you'd check against the actual workflow state
  
  // Check if project has started and is not completed
  const progress = project.progress;
  
  // A project is "In Progress" if it has some progress but is not complete
  // progress is a number between 0 and 1
  return progress > 0 && progress < 1;
}
```

Instead, all it had to do was this:

```ts
/**
 * Check if a project has "In Progress" status
 * In Linear, we check the project's status
 */
async function isProjectInProgress(project: Project): Promise<boolean> {
  // Check if project has started and is not completed
  const status = await project.status;
  
  // A project is "In Progress" if it has some progress but is not complete
  // progress is a number between 0 and 1
  return status?.name === "In Progress";
}
```

Another key error in its implementation is this:

```ts
/**
 * Get published jobs for a specific Linear organization
 * This is used for the public job board
 */
export async function getPublishedJobsByOrg(_linearOrgId: string): Promise<JobListing[]> {
  // For now, we'll use the authenticated user's context
  // In a production system, you might want to cache this data
  // or use a different approach for public access
  return await getPublishedJobs();
}
```

The oversight here, is that we actually have a Linear app, which is authenticated to fetch projects from this workspace, so we don't need the user's token here at all. We can just authenticate as "the app" and fetch projects that way. I'm giving vibe coding mode another chance to shine on this task.

Credit usage for this task:

```
Credits used: 5.54
Elapsed time: 4m 46s
```

Interestingly, credit usage does not seem to go up as the project advances. If this is based off of token usage, a comparison I can make here is Claude Code and Cursor, both of which use more and more tokens as the project grows as they find more files to read randomly without intent. Seems like Kiro does not suffer from side-quest fever.

Upon a bit of research, turns out I was wrong about Linear API access via authorised apps. What I need to do is when the user first authenticates, I also need to associate the workspace with the access token I get from Linear. I can then look this up on unathenticated requests.

The approach I took here - mostly using vibe code - bit of hand-coding where I felt like the LLM struggled to comprehend: add Upstash Redis as a layer to store all of the config we initially stored on each user object. This way we can imprersonate users when we need unauthenticated access. This will helps us in the next steps when we want to actually create Linear issues from submissions.

## Application form

Tried out-of-order task running. All requirements were met, so this task could be completed by Kiro. Still seems to be obsessed with building API routes, even if not explicitly told so, and/or if server functions are mentioned. I'd rather not start adding "DO NOT USE API ROUTES" in the tasks, but it seems like I might need to. This time I interrupted it and asked it to use server actions and it obliged.

```
The implementation follows Next.js 14+ best practices with server actions, providing a seamless user experience with proper validation at both client and server levels.
```

...Says Kiro. Our Next.js version is 16. Seems like it's maybe not aware, or just trying to generalise?

I also realised I can just ask Kiro to update tasks. I've asked it to split 9, which was arbitrarily split into 9.1 and 9.2 to instead be split based on Linear (9.1) and LiquidMetal (9.2) to allow me to work on these separately.

## Submitting the form

Even though this task was quite well-defined and small, compared to the previous ones, we could observe how Kiro ramped up token (sorry, credit) usage:

```
Credits used: 1.55 (?)
Elapsed time: 1m 31s
```

On previous tasks, Kiro jumped head-first into implementation, without much thought. This time it did quite a lot of research. Most importantly, it used server actions, without me having to prompt it to in addition to the task.

The form worked on the first try and it successfully added a new issue in Linear, which is fantastic! It did disregard my original ask though. I clearly asked it to upload documents as attachments to Linear. It decided to go another route and assume it could just use SmartBucket later on:

```ts
// Note: Linear SDK doesn't directly support file uploads via API
// The document is created with metadata about the file
// For actual file storage, we would need to use Linear's file upload endpoint
// or integrate with SmartBuckets (which will be done in task 9.2)

// For now, we store the file metadata in the document
// Task 9.2 will implement SmartBuckets integration for actual file storage
```

I'm not sure why it refused to use Linear's file upload endpoint. I ended prompting vibe coding mode to implement this properly. Again, the refusal to use the internet for help really hurt it. It took it 8 tries to get it right. Linear uses a very simple signed URL approach for file uploads and what's cool, is that the SDK comes with the URL generator built-in, so all one has to do, is send a POST request with the information returned from the SDK call.

I decided to use Cerebras for inference, since I couldn't figure out what LiquidMetal is, or what it's supposed to do. Asking ChatGPT and Gemini yields more confusion. Their docs are horribly structured, so it's no wonder LLMs can't figure them out.

I knew that Kiro refusing to use the internet would seriously hurt this part, since a lot of these APIs and SDKs are only weeks old. The models won't have that "knowledge" yet, so it would just hallucinate endlessly. I hand-coded an example, that improves job descriptions. This covers all of the API surface required for the rest of the text inference features. Interested to see if Kiro's able to pick up on this.

My plan also seriously diverged from what's in `tasks.md`. I decided to vibe code (because I trust this mode more vs plan mode) one end-to-end example and then prompt spec mode to update the spec, based on the existing working implementation.

Vibe coding implemented the AI enhanced job description feature, with a critical flaw: I instructed it to remove the `enhance` label and place `ai-generated` label on the project instead. Unfortunately, Kiro implemented this in two steps. This meant that after each update, we'd get a new webhook event, which causes a new update, which causes a new webhook event, and so on, until infinity. I actually anticipated this, as it's a typical beginner mistake. I would've expected Kiro to catch this before self-DDoSing.

I added the following prompt to the vibe code session:

```
There's a critical error in your implementation: content update and label update needs to happen in the same request, otherwise, you trigger an infinite chain of update -> webhook -> update events. Move the logic that ensures label creation to above the update SDK call. Then update both content and labels in one call.
```

It sort of fixed it. Weirdly, the code it produced to fix this issue wasn't great, in terms of form, e.g.: early return opportunities were ignored, etc. This is a regression compared to prior code. I wonder if the fact that I gave it such detailed instructions, made it pick a cheaper model for this task?

A flaw in Kiro's implementation is that it used `client.issueLabels`, attempting to get project labels. Anyone reasonable would assume, that issue labels aren't compatible with projects. The Linear SDK also offers a `client.projectLabels` method. Could you guess what this does? Kiro couldn't. I pasted the failure from the console into the vibe coding session. Here's a snippet of the raw SDK error:

```
Error: Entity not found in validateAccess: labelIds: {"response":{"errors":[{"message":"Entity not found in validateAccess: labelIds","path":["projectUpdate"],"locations":[{"line":2,"column":3}],"extensions":{"type":"invalid input","code":"INPUT_ERROR","statusCode":400,"userError":true,"userPresentableMessage":"labelIds contained an entry that could not be found."}}],
```

Kiro came up with the following thought process.

```
Looks like we're trying to use issue labels for a project. This is wrong. No wait. Linear allows all labels to be used on all entity types. Using issue labels is fine.
```

It then proceeded to rename the variable `issueLabels` to `workspaceLabels`. This - of course - did nothing. It then decided to revert all of the changes that it made prior, which prevented the infinite loop issue, claiming that it was those changes that caused the failure. In reality, the fix was quite literally replacing `client.issueLabels` with `client.projectLabels`. This is by far the dumbest LLM coding mistake I've seen in the past year.

## The Cerebras pivot

For the first time, I'm going to update the spec. I opened spec mode and added this prompt:

```
I decided to pivot from using LiquidMetal to instead using Cerebras for inference. I've already implemented the client and added the env variables needed to .env.local. I also implemented the job description AI enhancement feature. Update the rest of the spec to use cerebras for AI features.
```

I wasn't sure if this would work. Updating existing spec, plan, etc isn't listed as one of the features of this mode. Seems like it did a good enough job initially. One thing that stood out, is it's hell-bent on adding caching for every expensive operation. We don't have a database, so it just adds caching to everything without any explanation. This is weird behaviour and I suspect the system prompt has a clause about caching expensive operations, but since we don't have an official database, the model just slaps "cache this" on things without knowing how.

One thing I really liked, is that when it updates the plan, it looks at the project state. E.g.: I installed the required dependencies for PDF and DOCX processing while it was updating the spec and it saw that these were already added, so it moved them to the setup step, which is already marked as completed.

I ran the update tasks process and it failed with this error:

```
Failed to replace text in .kiro/specs/ai-ats-linear-integration/tasks.md. Invalid operation - missing newStr. Try again with a valid newStr. Set newStr to the empty string '' to delete oldStr.. The agent has seen this error and will try a different approach to write the file if needed.
```

This is the first time I saw Kiro fail to edit a file. It's extremely reliable compared to something like Claude Code, which fails 30-50% of the time, or Cursor, that fails to write files 10-20% of the time. Unfortunately, it was not able to recover from this, the agent panel froze and no progress was made for 5+ minutes. I decided to stop it manually and try again.

It ended up re-writing the entire tasks.md file. I was too lazy to read it all, so I just accepted and moved on.

## Process CV and cover letter

DOCX works fine (one-shot). PDF fails with:

```
CV parsing failed: Error: Failed to parse CV file: Failed to parse PDF: Setting up fake worker failed: "Cannot find module '/Users/.../projects/linear-ats/.next/dev/server/chunks/ssr/pdf.worker.mjs' imported from /Users/.../projects/linear-ats/.next/dev/server/chunks/ssr/95353_pdfjs-dist_legacy_build_pdf_mjs_527c99d9._.js".

    at parseCV (lib/linear/cv-parser.ts:64:11)

    at async submitApplication (lib/actions/application.ts:75:24
```

Threw this error back at the chat, see if it can fix it. The issue is that in NextJS, we need to mark packages that depend on spawning workers as external. It tried adding Webpack config to solve this, but of course, this is NextJS 16, so Turbopack is enabled by default. I was pleasantly surprised when instead of downgrading NextJS, like a lot of other tools would do, it managed to port the config to Turbopack instantly.

## Candidate pre-screening

Seems like this is the right task size for Kiro. Sub-tasks take a lot less time to complete (2-3 mins) and use fewer credits. This heuristic could be used to inform Kiro's planning output, to better prepare for the optimal task size.

### The good

It added a fairly decent prompt. Looks like it reads from other adjacent files or at least there's some sort of RAG step, because the style of this prompt matched very closely the style of the prompt I used for improving job descriptions.

```
## Output Format:

You must respond with a valid JSON object in the following format:

{
  "confidence": "high" | "low" | "ambiguous",
  "reasoning": "A clear explanation of your assessment",
  "matchedCriteria": ["Specific criterion 1 with evidence", "Specific criterion 2 with evidence"],
  "concerns": ["Specific concern 1", "Specific concern 2"]
}

Important: Return ONLY the JSON object, no additional text or formatting.
```

### The bad

It forgot a key property, which enhances Cerebras' output:

```ts
response_format: {
  type: "json_object",
},
```

I added this manually.

For some reason Kiro decided to add an extra function that maps the confidence level of the AI response to the desired issue state, instead of using `.recommendedState` on the response. This makes 0 sense in this context. The right heuristic is defined in the `design.md` and `tasks.md` files. Truly puzzling.

> Moments like these are very important. They signal to me, that I still need to review every line of AI-generated code. Can't let Kiro free-range.


## Mapping issue states

There was another bug, where we were trying to set issue states. There's no mention of this in the original design, but you can have any number of issue states in Linear, but there's no guarantee, that our user would've set these up themselves. I asked Kiro vibe mode to add a helper to ensure issue states exist, before adding them.

## Landing page

Vibe coded landing page. Got ChatGPT to generate me a logo, turned it into favicon with favicon.ico.

Used shadcn ui blocks (only free ones) to build this frankenstein landing page layout.

## Implementing pricing with Polar

learnings:

1. "add polar for monetisation" is too small of a task for Kiro. It way over-engineered the plan. It decided to re-implement the entire SDK I kept plan in-tact just to show, ended up steering Kiro away from re-implementing the entire Polar.sh type system and SDK.
2. starting multiple tasks in parallel doesn't work, but you can queue tasks. Unfortunately that feature doesn't work either. As soon as the first task finishes, it'll cancel the rest of the queued tasks. This is a bug and I'm sure they'll fix it at some point, but it's annoying that I can't just queue the entire task list and leave.

I instructed Kiro to use Context7 to search for docs, because it defaulted to exploring the file system of the libraries it was trying to use. This was proving to be a problem, although Polar's SDK is pretty well structured, generated by Speakeasy.

I can't get Kiro to keep using Context7 consistently, it keeps falling back to this annoying pattern:

```
npm list @polar-sh/sdk

npm list @polar-sh/sdk linear-ats@1.0.0 /Users/emod.kovacs/projects/linear-ats
└── @polar-sh/sdk@0.41.5
```

This is both more context-heavy than using Context7 and takes much longer. I also have to keep approving / adding new commands to the approve list as the agent finds more and more creative ways to traverse my file system and read files.

Even after manually editing tasks.md and deleting the dumb re-implementation of Polar's Webhook handling SDK, Kiro kept re-implementing it, so I decided to cut plan mode usage short, since I wasted 58 credits (almost the same amount as it took to implement the entire first plan) trying to get it to understand that it's doing useless shit. Decided to vibe code the rest of the steps. At least until we get past webhook implementation.

Kiro decided to present a billing error to users when they apply for a job if it fails. This technically can't happen, since we don't run any billable functions in sync with job applications. This is however a huge mistake and incredibly dumb user experience. I vibe coded this prompt:

```
In application form you added an new bit of logic where we show usage limit warning and prompt applicant to upgrade. This makes no sense, why would we want a person applying to a role to upgrade when the company that posted the role ran out of usage credits?
```

Although it reverted the changes in the file, I wanted to see if it would go off to check if similar errors in logic. This is something Claude Code likes to do, but Kiro didn't.

A new behaviour I hadn't seen Kiro do before, is it left a `task-19-implementation-notes.md` file. Makes no sense why it did this. I'll leave this in. It includes the issue I described above.

## ElevenLabs integration and emails via Resend

Initially I wanted to add these two features separately, but based on past experience, both features would've been "too small" for Kiro and I felt I'd risk it overengineering both, so I decided to implement both in one go.

Trick: I removed the final requirement (security: webhook validation) from `requirements.md`. It's very likely that validation is built into how these two dependencies integrate and if not, I can always add this later. Kiro wasted 60+ credits on adding its own webhook validation logic on top of the already built-in validation logic of Polar SDK last time.

Another trick: Kiro loves layering interfaces on top of interfaces on top of SDKs. This creates code that's very brittle and difficult to re-use, because the implementors have to know about which Kiro-induced layer they're interacting with as opposed to just using the SDK directly. I instructed Kiro to update the design:

```
You re-implemented a lot of features that already exist in resend and elevenlabs sdks. Use context7 to research these SDKs and use their interfaces as examples instead of creating new ones.
```

It cleared up a lot of the slop it added to `design.md`, but crucially it left in a recently-added Resend feature: email <-> template mapping. I added this prompt to clear it up:

```
No need for your email template mapping implementation. Resend has this feature built in:

https://resend.com/docs/dashboard/templates/introduction
```

It refused to fetch the URL (even though `fetch` tool is enabled). To the surprise of absolutely no one: it hallucinated the dumbest interface for templates I've ever seen. I intructed it more sternly to fetch the URL to get the actual interface right.

There's a technique to achieve fully email header-based threading. Kiro didn't reach for this solution, and instead opted for a mapping layer implemented in our own database. The reason I prefer the header-based approach is that it's stateless. If our DB goes down or there's a temporary outage when the replies are sent, I don't have to worry about orphan email chains.

I pulled up Gemini 2.5 Pro and asked it to give a simple and concise explanation of how to achieve this. I then pasted this in Kiro along with my own instructions to iterate on the design. This is the longest time I've spent iterating on the design so far. I want to see how it affects the plan.

A workflow that could work way better is similar to how Claude Code planning works. It collaborates with you, by presenting you with decisions for each milestone it considers important. E.g.: for this project, the right workflow would've looked something like this:

1. **Reseach upfront**: without me prompting it to. Use the internet, use Context7, or whatever tools it has access to to get a better picture of the interconnected parts.
2. **Disambiguate interactively**: ask me questions where it makes sense, e.g.: "do you want to use the database to map email threads to responses or should I plan for a stateless solution using email headers?"
3. **Create a rough outline**: Kiro design documents are massive. I often just skim the headings, because it's just a lot of text to get through. I wish there was an outline I could approve first, before it sloppifies it.
4. **Build design from approved outline**: this would reduce overall credit usage. Whether it's to the benefit of Amazon or not, is a different question, but it would definitely benefit users.

Overall, this is by far the best plan it produced out of all my attempts. Looks like it's worth spending quite a bit of time in the design phase.

```
Credits used: 10.84
Elapsed time: 49m 43s
```

Despite being instructed explicitly, to use Resend's email template feature and having examples in design.md and clear instructions in tasks.md, Kiro still re-rolled email templating from scratch, using string templates. It also hallucinated the wrong implementation using:

```ts
const { data, error } = await resend.emails.send({
  from: config.resend.fromEmail,
  to: params.to,
  subject: params.subject,
  react: params.template as any, // Resend SDK expects 'react' for templates
  replyTo: params.replyTo,
  headers: params.headers,
  tags: params.tags,
});
```

This wouldn't even work, since it neglected to use the right params (Resend works with `react-email`). I ended up having to manually implement templating. This is a fairly new feature, but it is well-documented both online and on Context7. Even after multiple tool calls, where the content was right, it seemed like whatever model Kiro was using at the time simply ignored its context and just wrote whatever code it had in its training data instead. This makes me regret spending so much time on planning, since I had to hand-code the majority of the feature anyway.

MASSIVE FAIL: Kiro completely went off script and decided to re-implement old-style defunct resend templating instead of using existing emails like instructed in tasks.md

At this point I was sure this wouldn't be done today. Kiro completely failed twice in a row, even with a rock solid implementation plan. It spit out 3 different resend client initialisation implementations, two separate templating solutions and 3 separate email sending implementations, where one of them I hand-fixed to use templates, but the other two are just useless trash.

Even though we instructed it not to write tests, it sometimes does. It's also very pleased with itself, wasting hundreds of tokens on explaining how great this is, e.g.:

```
Test Results:
✅ All 28 unit tests passing ✅ No TypeScript diagnostics ✅ Validates Requirements 2.1, 3.1, 3.2, 3.3

The implementation is ready to be used by webhook handlers and application submission flows!
```

These unit tests are pretty rudimentary. Truly nothing to write home about.

Unfortunately, the streak of bad code by Kiro kept continuing. This is probably caused by Anthropic severely nerfing Sonnet and Haiku over the weekend - probably to incentivise using Opus, which was made available on Claude Code Pro recently.

```
we already check benefits elsewhere, please research how we do it, before reimplementing logic, e.g.: lib/polar/client.ts has similar functionality. If you create a generic benefit checking function, you should replace previously implemented benefit checking logic with that instead of keeping multiple implementations
```

It managed to re-use some of the benefit logic, but decided to ignore my other instruction to consolidate the code. Very characteristic of a stunted Claude Haiku.

It also built this monster:

```ts
/**
 * Get a descriptive error message for missing benefit
 * Requirements: 9.4
 * 
 * @param benefitType - Type of benefit ('email' or 'ai_screening')
 * @returns User-friendly error message
 */
export function getBenefitErrorMessage(
  benefitType: 'email' | 'ai_screening'
): string {
  if (benefitType === 'email') {
    return 'Email communication feature is not available for your subscription tier. Please upgrade to access this feature.';
  } else {
    return 'AI screening feature is not available for your subscription tier. Please upgrade to access this feature.';
  }
}
```

There's no reason to have this. None of these features are ever on a user-driven path, so these error messages would never be shown. It's also quite possibly the dumbest way to implement this. Looks like someone's first line of JavaScript. I deleted this.

I tried to refactor the issue lifecycle to be a state machine, based on issue state and labels, using vibe code mode. What's interesting is that Kiro spat out 5 new markdown documents, but wrote very little code. These documents do not help the project at all, they're like: REFACTORING_SUMMARY.md, STATE_MACHINE_CHECKLIST.md, EMAIL_STATE_MACHINE.md, SINGLE_UPDATE_PATTERN.md, STATE_MACHINE.md. They all contain roughly the same info: my prompt, inflated with AI slop.

> Does Kiro system prompt have some sort of directive that instructs it if the task is too small to produce a bunch of slop to inflate token usage?

I also noticed Kiro started throwing a bunch of `any`s in places where typing is trivial:

```ts
async function sendConfirmationEmailIfEnabled(
  issue: any,
  project: any,
  linearOrgId: string,
  linearAccessToken: string
): Promise<void> {
```

I updated most of these by hand:

```ts
async function sendConfirmationEmailIfEnabled(
  issue: Issue,
  project: Project,
  linearOrgId: string,
  linearAccessToken: string
): Promise<void> {
```

stuff like:

```ts
const currentLabelIds = labels.nodes
  .filter((l: any) => l.name !== STATE_LABELS.PROCESSED)
  .map((l: any) => l.id);
```

where the right solution is literally just:

```ts
const currentLabelIds = labels.nodes
  .filter((l) => l.name !== STATE_LABELS.PROCESSED)
  .map((l) => l.id);
```

Fixing these uncovered some issues, mainly Kiro not handling optional return types, where `team` could be `undefined`. I fixed these by hand.

## Screening interview session

Kiro implemented this in a very flawed way again. It used a probabilistic time-based matching algorithm, which meant that if a user starts a session and while they're talking to the screening agent, another user starts another session, it would then associate user 1's results with user 2. This is a huge flaw. What makes this especially horrible is that if I didn't review the code and just tried it outright, I wouldn't have been able to tell that this failure mode exists.

This is also by far the most expensive part of this project. Each call costs cold hard cash. This is something that must work well. Used vibe coding to try to fix it.

It hallucinated the large part of the solution, even though I literally copy/pasted what to do from Gemini. I had to hand-implement this. It was all using existing SDK calls too, from parts of the SDK we're already using for other requests. Kiro even left a comment explaining that this method is not part of the SDK yet. This of course, was false. It also spat out 5 new markdown files, most of which just duplicated the same content. Again, this seems like something it started doing today. Wish I could just turn this off.

It also hadn't completed the solution and just left a massive TODO:

```ts
// TODO: Initialize ElevenLabs conversation with @11labs/react
// This will be implemented after installing the package
```

Why it wouldn't just install the package is puzzling or why it needed it for an implementation when it can use the internet or Context7 is another issue. I don't think I'll be using Kiro for anything serious. It just lacks the mechanisms for actual real-life software development. For non-developers, it's scary how many critical flaws it created, even despite all the illusionary safety harnesses. For software engineers, there's just too many more competitive options

I counted the tokens in one of the random slop files it spat out:

```
2060 tokens 8243 characters 965 words
```

Comical.