/**
 * Curricula standards and course catalog for US & Canadian High Schools (Grades 9-12).
 * Aligns Socratic LLM tutoring with formal educational standards.
 */
export const CURRICULA = {
  us: {
    country: "United States",
    name: "US National & State Standards (Common Core, NGSS, AP)",
    grades: ["Grade 9", "Grade 10", "Grade 11", "Grade 12", "AP / Advanced"],
    subjects: [
      {
        id: "us-math",
        name: "Mathematics",
        framework: "Common Core State Standards for Math (CCSS.MATH) & College Board AP",
        courses: [
          {
            id: "us-alg1",
            name: "Algebra I",
            topics: [
              "Linear Equations & Inequalities",
              "Systems of Linear Equations",
              "Quadratic Functions & Factoring",
              "Exponential Growth & Decay",
              "Interpreting Functions & Graphs"
            ],
            standardRef: "CCSS.MATH.CONTENT.HSA"
          },
          {
            id: "us-geom",
            name: "Geometry",
            topics: [
              "Congruence & Proofs",
              "Similarity & Right Triangle Trigonometry",
              "Circles & Arc Lengths",
              "Coordinate Geometry",
              "Geometric Modeling & Volume"
            ],
            standardRef: "CCSS.MATH.CONTENT.HSG"
          },
          {
            id: "us-alg2",
            name: "Algebra II / Trigonometry",
            topics: [
              "Polynomial, Rational, & Radical Relationships",
              "Complex Numbers",
              "Logarithmic & Exponential Models",
              "Trigonometric Functions & Unit Circle",
              "Inferences & Statistical Conclusions"
            ],
            standardRef: "CCSS.MATH.CONTENT.HSF"
          },
          {
            id: "us-calc-ap",
            name: "AP Calculus AB / BC",
            topics: [
              "Limits & Continuity",
              "Differentiation: Definition & Fundamental Properties",
              "Applications of Differentiation (Optimization, Related Rates)",
              "Integration & Accumulation of Change (FTC)",
              "Differential Equations & Slope Fields",
              "Infinite Sequences & Series (BC)"
            ],
            standardRef: "College Board AP Calculus"
          },
          {
            id: "us-stat-ap",
            name: "AP Statistics",
            topics: [
              "Exploring One-Variable & Two-Variable Data",
              "Collecting Data & Experimental Design",
              "Probability, Random Variables, & Distributions",
              "Sampling Distributions & Central Limit Theorem",
              "Inference for Categorical & Quantitative Data"
            ],
            standardRef: "College Board AP Statistics"
          }
        ]
      },
      {
        id: "us-science",
        name: "Science",
        framework: "Next Generation Science Standards (NGSS) & AP Science",
        courses: [
          {
            id: "us-bio",
            name: "High School Biology / AP Biology",
            topics: [
              "Cell Structure, Organelles, & Membrane Transport",
              "Cellular Energetics (Photosynthesis & Cellular Respiration)",
              "Cell Communication & Cell Cycle (Mitosis/Meiosis)",
              "Heredity & Mendelian Genetics",
              "Gene Expression & Biotechnology",
              "Natural Selection & Ecology"
            ],
            standardRef: "NGSS HS-LS1 through HS-LS4"
          },
          {
            id: "us-chem",
            name: "High School Chemistry / AP Chemistry",
            topics: [
              "Atomic Structure & Periodic Trends",
              "Chemical Bonding & Molecular Geometry (VSEPR)",
              "Intermolecular Forces & States of Matter",
              "Chemical Reactions & Stoichiometry",
              "Kinetics & Reaction Rates",
              "Thermodynamics & Enthalpy",
              "Chemical Equilibrium & Le Chatelier's Principle",
              "Acids, Bases, & pH Buffers"
            ],
            standardRef: "NGSS HS-PS1 / College Board AP Chem"
          },
          {
            id: "us-phys",
            name: "High School Physics / AP Physics 1 & C",
            topics: [
              "Kinematics in 1D & 2D (Projectile Motion)",
              "Newton's Laws of Motion & Free Body Diagrams",
              "Work, Energy, & Conservation of Energy",
              "Linear Momentum & Collisions",
              "Rotational Motion & Torque",
              "Simple Harmonic Motion & Waves",
              "Electric Charge, Fields, & DC Circuits"
            ],
            standardRef: "NGSS HS-PS2 / College Board AP Physics"
          }
        ]
      },
      {
        id: "us-humanities",
        name: "English Language Arts & Social Studies",
        framework: "Common Core ELA & AP Social Studies",
        courses: [
          {
            id: "us-ela",
            name: "English 9-12 / AP English Literature",
            topics: [
              "Textual Evidence & Literary Analysis",
              "Rhetorical Devices & Argumentative Writing",
              "Theme & Character Development in Drama and Prose",
              "Evaluating Author's Tone, Bias, and Purpose",
              "Synthesis Essay Composition & Citation"
            ],
            standardRef: "CCSS.ELA-LITERACY.RL / RI.9-12"
          },
          {
            id: "us-history",
            name: "US History / AP US Government",
            topics: [
              "Foundations of American Democracy & Constitution",
              "Civil War, Reconstruction, & Expansion",
              "Industrialization & The Progressive Era",
              "Cold War, Civil Rights Movement, & Foreign Policy",
              "Branches of Government, Checks & Balances, & Civil Liberties"
            ],
            standardRef: "C3 Framework for Social Studies / AP US Gov"
          }
        ]
      }
    ]
  },
  canada: {
    country: "Canada",
    name: "Canadian Provincial Curricula (Ontario OSS, British Columbia, Alberta)",
    grades: ["Grade 9", "Grade 10", "Grade 11", "Grade 12"],
    subjects: [
      {
        id: "ca-ontario-math",
        name: "Ontario Secondary Mathematics (OSS)",
        framework: "Ontario Ministry of Education High School Curriculum",
        courses: [
          {
            id: "ca-mth1w",
            name: "MTH1W - Grade 9 De-streamed Mathematics",
            topics: [
              "Number Sense & Operations with Powers",
              "Algebraic Expressions, Linear Relations, & Equations",
              "Measurement, Geometry, & Coding Connections",
              "Data Literacy, Probability, & Mathematical Modeling"
            ],
            standardRef: "Ontario Math MTH1W"
          },
          {
            id: "ca-mpm2d",
            name: "MPM2D - Grade 10 Principles of Mathematics",
            topics: [
              "Quadratic Relations & Factoring Quadratics",
              "Analytic Geometry & Equations of Lines",
              "Trigonometry of Right & Acute Triangles (Sine/Cosine Laws)",
              "Solving Linear Systems Graphically and Algebraically"
            ],
            standardRef: "Ontario Math MPM2D"
          },
          {
            id: "ca-mcr3u",
            name: "MCR3U - Grade 11 Functions (University Prep)",
            topics: [
              "Characteristics of Functions & Transformations",
              "Exponential Functions & Equations",
              "Discrete Functions (Sequences, Series, & Financial Math)",
              "Trigonometric Ratios, Radian Measure, & Sine Waves"
            ],
            standardRef: "Ontario Math MCR3U"
          },
          {
            id: "ca-mcv4u",
            name: "MCV4U - Grade 12 Calculus and Vectors",
            topics: [
              "Rate of Change & Derivatives of Polynomial/Rational Functions",
              "Derivatives of Exponential, Trigonometric, & Logarithmic Functions",
              "Curve Sketching, Optimization, & Velocity/Acceleration",
              "Geometric & Algebraic Vectors in 2-Space and 3-Space",
              "Equations of Lines & Planes in 3-Space"
            ],
            standardRef: "Ontario Math MCV4U"
          },
          {
            id: "ca-mhf4u",
            name: "MHF4U - Grade 12 Advanced Functions",
            topics: [
              "Polynomial & Rational Functions",
              "Trigonometric Identities & Equations",
              "Logarithmic & Exponential Functions",
              "Combining Functions & Rates of Change"
            ],
            standardRef: "Ontario Math MHF4U"
          }
        ]
      },
      {
        id: "ca-science",
        name: "Canadian Secondary Science (Ontario & Western)",
        framework: "Ontario Secondary Curriculum & Western Canadian Protocol (WNCP)",
        courses: [
          {
            id: "ca-snc2d",
            name: "SNC2D - Grade 10 Academic Science",
            topics: [
              "Tissues, Organs, & Systems of Living Things (Biology)",
              "Chemical Reactions, Acids & Bases (Chemistry)",
              "Earth's Climate & Climate Change (Earth Science)",
              "Light and Geometric Optics, Snell's Law (Physics)"
            ],
            standardRef: "Ontario Science SNC2D"
          },
          {
            id: "ca-sch3u-4u",
            name: "SCH3U / SCH4U - Grade 11/12 Chemistry",
            topics: [
              "Matter, Chemical Trends, & Chemical Bonding",
              "Chemical Quantities & The Mole Concept",
              "Solutions, Solubility, & Stoichiometry",
              "Organic Chemistry & Functional Groups",
              "Energy Changes & Rates of Reaction",
              "Chemical Systems & Dynamic Equilibrium",
              "Electrochemistry & Redox Reactions"
            ],
            standardRef: "Ontario Chemistry SCH4U"
          },
          {
            id: "ca-sph3u-4u",
            name: "SPH3U / SPH4U - Grade 11/12 Physics",
            topics: [
              "Kinematics & Dynamics in 1D and 2D",
              "Energy and Momentum Conservation",
              "Gravitational, Electric, and Magnetic Fields",
              "Wave Nature of Light & Quantum Mechanics Intro",
              "Special Relativity Essentials"
            ],
            standardRef: "Ontario Physics SPH4U"
          },
          {
            id: "ca-sbi3u-4u",
            name: "SBI3U / SBI4U - Grade 11/12 Biology",
            topics: [
              "Biochemistry (Macromolecules & Enzymes)",
              "Metabolic Processes (Respiration & Photosynthesis)",
              "Molecular Genetics (DNA Replication, Transcription, Translation)",
              "Homeostasis & Endocrine/Nervous System",
              "Population Dynamics & Biodiversity"
            ],
            standardRef: "Ontario Biology SBI4U"
          }
        ]
      },
      {
        id: "ca-humanities",
        name: "Canadian English & Social Sciences",
        framework: "Ontario & BC Secondary Humanities",
        courses: [
          {
            id: "ca-eng4u",
            name: "ENG4U - Grade 12 English (University Prep)",
            topics: [
              "Critical Analysis of Contemporary & Classical Literature",
              "Indigenous Perspectives in Canadian Literature",
              "Formal Literary Essay & Thesis Development",
              "Rhetorical Strategies & Media Literacy"
            ],
            standardRef: "Ontario English ENG4U"
          },
          {
            id: "ca-chc2d",
            name: "CHC2D - Canadian History Since World War I",
            topics: [
              "Canada and World War I & II",
              "Indigenous Treaties, Residential Schools, & Truth and Reconciliation",
              "Post-War Society, Multiculturalism, & Charter of Rights",
              "Canada on the World Stage & Modern Identity"
            ],
            standardRef: "Ontario History CHC2D"
          }
        ]
      }
    ]
  }
};

/**
 * Pre-configured Socratic activity templates to inspire teachers during assignment creation
 */
export const ACTIVITY_TEMPLATES = [
  {
    id: "tpl-log-laws-mhf4u",
    title: "Product, Quotient, and Power Laws of Logarithms (MHF4U)",
    curriculum: "canada",
    subjectId: "ca-ontario-math",
    courseId: "ca-mhf4u",
    topic: "Laws of Logarithms (Product, Quotient, Power)",
    gradeLevel: "Grade 12",
    socraticStyle: "guided_scaffold",
    currentLevel: "B",
    learningGoal: "Students should uncover how to apply Product, Quotient, and Power laws to simplify logarithmic expressions and solve equations.",
    prompt: "Simplify into a single numerical value: 2 log_3(6) - log_3(4). Take a look at the first term. What rule allows us to absorb that multiplier 2 into an exponent?",
    initialHint: "Remember the Power Law: k * log_b(M) = log_b(M^k). Always absorb coefficients before subtracting!",
    targetMilestones: [
      "Applied Power Law: 2 log_3(6) = log_3(6^2) = log_3(36)",
      "Applied Quotient Law: log_3(36) - log_3(4) = log_3(36/4) = log_3(9)",
      "Evaluated numerical value: log_3(9) = 2",
      "Solved parallel problem on mastery check"
    ],
    courseMaterialsSource: "Google Classroom Stream (Igor RPS — Product and Quotient Laws.pdf)",
    courseMaterials: `Reference Sheet: Product, Quotient, and Power Laws of Logarithms
Course: MHF4U Grade 12 Advanced Functions | Unit: Logarithmic Functions

1. THE PRODUCT LAW OF LOGARITHMS:
   log_b(xy) = log_b(x) + log_b(y)  (b > 0, b != 1, x > 0, y > 0)
   Example: log_2(8 * 4) = log_2(8) + log_2(4) = 3 + 2 = 5.

2. THE QUOTIENT LAW OF LOGARITHMS:
   log_b(x / y) = log_b(x) - log_b(y)  (b > 0, b != 1, x > 0, y > 0)
   Example: log_3(36 / 4) = log_3(36) - log_3(4) = log_3(9) = 2.

3. THE POWER LAW OF LOGARITHMS:
   log_b(x^k) = k * log_b(x)  (b > 0, b != 1, x > 0)
   Example: 2 * log_3(6) = log_3(6^2) = log_3(36).

CRITICAL RULE FOR MULTI-STEP SIMPLIFICATIONS:
   When simplifying expressions like 2*log_3(6) - log_3(4), you MUST apply the Power Law first to absorb numerical coefficients into exponents, BEFORE combining terms using the Quotient or Product Law.`
  },
  {
    id: "tpl-quadratics",
    title: "Deriving the Quadratic Formula & Vertex Form",
    curriculum: "us",
    subjectId: "us-math",
    courseId: "us-alg1",
    topic: "Quadratic Functions & Factoring",
    gradeLevel: "Grade 10",
    socraticStyle: "strict_socratic",
    learningGoal: "Students should uncover how completing the square on ax² + bx + c = 0 leads to the quadratic formula, and understand why the discriminant determines the number of roots.",
    prompt: "Let's investigate the quadratic equation $2x^2 + 8x - 10 = 0$. Instead of using a memorized formula right away, how could we rewrite this so that $x$ only appears once? What strategy might help us transform the left side into a perfect square trinomial?",
    initialHint: "Think about dividing the entire equation by the leading coefficient first to make the coefficient of $x^2$ equal to 1.",
    targetMilestones: [
      "Divided both sides by leading coefficient",
      "Identified term needed to complete the square ((b/2)²)",
      "Factored into binomial square (x + d)²",
      "Understood meaning of discriminant"
    ],
    courseMaterialsSource: "OpenStax Algebra & Trigonometry 2e (Rice Univ) — Chapter 2: Quadratic Equations & Completing the Square",
    courseMaterials: `TEXTBOOK CHAPTER 4 EXCERPT: Completing the Square & Quadratic Identities
[Source: OpenStax Algebra & Trigonometry 2e, Section 2.5]
- Standard Form of a Quadratic: ax² + bx + c = 0 (where a ≠ 0).
- The Perfect Square Trinomial Rule: (x + h)² = x² + 2hx + h²
- Key Technique: When an algebraic expression is of the form x² + Bx, adding the constant term (B/2)² creates the factored binomial square (x + B/2)².
- Geometric Area Model: Adding (B/2)² geometrically completes the missing corner of an area model consisting of an x-by-x square and two (B/2)-by-x rectangles.
- The Quadratic Formula Derivation:
  1. Divide through by a: x² + (b/a)x + (c/a) = 0
  2. Subtract c/a from both sides: x² + (b/a)x = -c/a
  3. Add (b / 2a)² = b² / (4a²) to both sides.
  4. Factor left side: (x + b / (2a))² = (b² - 4ac) / (4a²)
  5. Take square roots and solve for x: x = (-b ± √(b² - 4ac)) / (2a)
- Discriminant Definition: Δ = b² - 4ac. When Δ > 0, two real roots; when Δ = 0, one repeated root; when Δ < 0, two complex roots.`
  },
  {
    id: "tpl-stoichiometry",
    title: "Limiting Reactants & Stoichiometric Ratios",
    curriculum: "canada",
    subjectId: "ca-science",
    courseId: "ca-sch3u-4u",
    topic: "Chemical Quantities & The Mole Concept",
    gradeLevel: "Grade 11",
    socraticStyle: "guided_scaffold",
    learningGoal: "Students determine the limiting reactant in the synthesis of water (2H₂ + O₂ -> 2H₂O) given unequal initial masses, understanding the role of molar mass.",
    prompt: "We have 10.0 grams of hydrogen gas ($H_2$) reacting with 64.0 grams of oxygen gas ($O_2$) according to the balanced equation: $2H_2 + O_2 \\rightarrow 2H_2O$. A student quickly guesses that hydrogen is the limiting reactant because 10.0g is less than 64.0g. Do you agree or disagree with their reasoning? How can we test this scientifically?",
    initialHint: "In chemical reactions, do molecules react based on their mass in grams, or based on the number of particles (moles)?",
    targetMilestones: [
      "Converted grams of H₂ and O₂ to moles using molar mass",
      "Compared molar ratio to balanced equation coefficients (2:1)",
      "Correctly identified limiting reactant (O₂)",
      "Calculated theoretical yield of H₂O in grams"
    ],
    courseMaterialsSource: "OpenStax Chemistry 2e — Chapter 4: Stoichiometry of Chemical Reactions & Limiting Reactants",
    courseMaterials: `TEXTBOOK CHAPTER 4 EXCERPT: Reaction Stoichiometry & Limiting Reactants
[Source: OpenStax Chemistry 2e, Section 4.3 & Ontario Curriculum SCH3U]
- Fundamental Principle: Chemical equations describe reactions on a particulate and molar basis, NOT directly on a mass basis.
- Balanced Synthesis of Water: 2 H₂(g) + O₂(g) → 2 H₂O(g)
- Stoichiometric Mole Ratio: 2 moles of H₂ react with exactly 1 mole of O₂ to produce 2 moles of H₂O.
- Molar Masses:
  * H₂: ~2.016 g/mol
  * O₂: ~31.998 g/mol
  * H₂O: ~18.015 g/mol
- Limiting Reactant Definition: The reactant completely consumed in a chemical reaction that limits the amount of product formed.
- Common Misconception: The reactant present in the smallest mass (in grams) is NOT necessarily the limiting reactant. Always convert masses to moles first!`
  },
  {
    id: "tpl-photosynthesis",
    title: "Light Reactions vs. Calvin Cycle Mechanics",
    curriculum: "us",
    subjectId: "us-science",
    courseId: "us-bio",
    topic: "Cellular Energetics (Photosynthesis & Cellular Respiration)",
    gradeLevel: "Grade 11",
    socraticStyle: "strict_socratic",
    learningGoal: "Students explain how ATP and NADPH generated in the thylakoid membrane drive carbon fixation in the stroma, and predict what happens if light is removed.",
    prompt: "Imagine an aquatic plant (like Elodea) has been happily photosynthesizing under bright light. Suddenly, we turn off the light source. The student claims: 'The Calvin cycle will immediately continue indefinitely because it's the light-independent reaction!' What is the flaw in this statement? Where do the molecules that power the Calvin cycle come from?",
    initialHint: "Recall what the light-dependent reactions produce that the Calvin cycle consumes. What happens when that supply runs out?",
    targetMilestones: [
      "Identified ATP and NADPH as the energy carriers linking both stages",
      "Explained that Calvin cycle requires these products to fix CO₂ into G3P",
      "Predicted that Calvin cycle stops shortly after light is removed due to ATP/NADPH depletion"
    ],
    courseMaterialsSource: "OpenStax Biology 2e — Chapter 8: Photosynthesis (Light-Dependent Reactions and the Calvin Cycle)",
    courseMaterials: `TEXTBOOK CHAPTER 8 EXCERPT: Light Reactions & The Calvin-Benson Cycle
[Source: OpenStax Biology 2e, Chapter 8 / NGSS HS-LS1-5]
- Overview: Photosynthesis takes place in chloroplasts through two interconnected stages:
  1. Light-Dependent Reactions (in Thylakoid membranes):
     - Chlorophyll absorbs photons, exciting electrons in Photosystem II and I.
     - Photolysis of water: 2 H₂O → 4 H⁺ + 4 e⁻ + O₂ (releases byproduct oxygen).
     - Generates high-energy chemical intermediates: ATP (via photophosphorylation) and NADPH.
  2. Calvin Cycle (Light-Independent Reactions in Stroma):
     - Fixes atmospheric CO₂ into 3-PGA via the enzyme RuBisCO.
     - Reduces 3-PGA to G3P using electrons from NADPH and energy from ATP.
     - Regenerates RuBP (ribulose bisphosphate).
- Critical Dependency: Although the Calvin cycle enzymes do not directly require light photons, the cycle relies on a continuous supply of ATP and NADPH from the light reactions. In the dark, the Calvin cycle halts once ATP and NADPH pools are depleted within minutes.`
  },
  {
    id: "tpl-vectors-3d",
    title: "Lines & Intersecting Planes in 3-Space",
    curriculum: "canada",
    subjectId: "ca-ontario-math",
    courseId: "ca-mcv4u",
    topic: "Equations of Lines & Planes in 3-Space",
    gradeLevel: "Grade 12",
    socraticStyle: "guided_scaffold",
    learningGoal: "Students determine whether two lines in 3-space intersect, are parallel, or are skew, and interpret direction vectors.",
    prompt: "Consider two lines in $\\mathbb{R}^3$: $L_1: \\vec{r} = (1, 2, 3) + t(2, -1, 4)$ and $L_2: \\vec{r} = (3, 1, 7) + s(-4, 2, -8)$. Before trying to solve for intersection points, what should you inspect first about the direction vectors $\\vec{d}_1 = (2, -1, 4)$ and $\\vec{d}_2 = (-4, 2, -8)$? What does this tell you about their geometric relationship?",
    initialHint: "Is there a scalar factor $k$ such that $\\vec{d}_2 = k \\vec{d}_1$?",
    targetMilestones: [
      "Recognized direction vectors are scalar multiples (collinear)",
      "Concluded lines are either parallel and distinct, or coincident",
      "Tested a point from L₁ in L₂ to determine whether they are identical or distinct parallel lines"
    ],
    courseMaterialsSource: "Ontario Curriculum MCV4U / OpenStax Calculus Volume 3 — Chapter 2: Vectors in Space",
    courseMaterials: `TEXTBOOK CHAPTER 2 EXCERPT: Lines and Planes in 3-Dimensional Space
[Source: Ontario Ministry of Education MCV4U & OpenStax Calculus Vol 3, Sec 2.5]
- Vector Equation of a Line in ℝ³: r = r₀ + t d, where r₀ = (x₀, y₀, z₀) is a point on the line and d = (a, b, c) is a nonzero direction vector.
- Collinear Direction Vectors: Two lines with direction vectors d₁ and d₂ are parallel if and only if d₂ = k d₁ for some nonzero real scalar k.
- Four Possibilities for Two Lines in ℝ³:
  1. Parallel and Distinct (d₁ || d₂, no common points)
  2. Parallel and Coincident (d₁ || d₂, infinite common points; line 1 is line 2)
  3. Intersecting at a Single Unique Point (d₁ ∦ d₂, system has exactly one solution for t and s)
  4. Skew Lines (d₁ ∦ d₂, do not intersect and do not lie in the same plane).`
  },
  {
    id: "tpl-rhetorical-analysis",
    title: "Analyzing Rhetorical Appeals & Fallacies",
    curriculum: "us",
    subjectId: "us-humanities",
    courseId: "us-ela",
    topic: "Rhetorical Devices & Argumentative Writing",
    gradeLevel: "Grade 11",
    socraticStyle: "socratic_discussion",
    learningGoal: "Students evaluate ethos, pathos, and logos in persuasive texts and identify subtle cognitive or logical fallacies without being told.",
    prompt: "Consider this advertisement claim: 'Nine out of ten dentists surveyed recommend Dentacare, and if you care about your children's future smile, you cannot afford to choose anything less.' How is this argument attempting to persuade you? Which specific rhetorical appeals are at play, and what underlying assumption or potential fallacy is being used?",
    initialHint: "Look at the phrase 'if you care about your children's future smile'—which emotion or human instinct is that targeting?",
    targetMilestones: [
      "Identified appeal to authority/ethos (dentists) and appeal to emotion/pathos (parental protective instinct)",
      "Spotted false dilemma / guilt fallacy ('if you don't use it, you don't care')",
      "Articulated how statistics ('9 out of 10') can obscure sample size and methodology"
    ],
    courseMaterialsSource: "College Board AP English Language & Composition Course Framework / Aristotle's Rhetoric",
    courseMaterials: `EXCERPT: Classical Rhetorical Appeals & Logical Fallacies
[Source: College Board AP English Language & Composition CED, Unit 1]
- The Rhetorical Triangle: Speaker, Audience, Subject/Message.
- Primary Modes of Persuasion:
  1. Ethos (Credibility / Character): Convincing the audience through the speaker's authority, moral character, or expert qualifications.
  2. Pathos (Emotional Appeal): Persuading by evoking empathy, fear, hope, guilt, or desire in the audience.
  3. Logos (Reasoning / Logic): Constructing arguments based on evidence, deductive/inductive reasoning, verified statistics, and premises.
- Common Fallacies to Scrutinize:
  * False Dilemma (Either-Or): Presenting two extreme alternatives as the only possibilities when intermediate options exist.
  * Appeal to False Authority (Argumentum Ad Verecundiam): Citing figures without showing methodology or context.
  * Appeal to Pity / Fear (Ad Baculum / Ad Misericordiam): Replacing reasoned justification with emotional coercion.`
  }
];

/**
 * Curated Library of Open Educational Course Materials for US & Canadian High Schools
 */
export const CURRICULUM_MATERIAL_LIBRARY = [
  {
    id: "lib-mhf4u-log-laws",
    title: "Ontario MHF4U — Product, Quotient & Power Laws of Logarithms",
    curriculum: "Canada MHF4U",
    subject: "Mathematics",
    gradeLevel: "Grade 12",
    source: "Ontario Ministry of Education MHF4U Reference Sheet",
    content: `Reference Sheet: Product, Quotient, and Power Laws of Logarithms (MHF4U Grade 12)
1. Product Law: $\\log_b(xy) = \\log_b(x) + \\log_b(y)$ for $b > 0, b \\neq 1, x > 0, y > 0$
   Base Example: $\\log_2(4) + \\log_2(8) = \\log_2(32) = 5$
2. Quotient Law: $\\log_b(x/y) = \\log_b(x) - \\log_b(y)$
   Base Example: $\\log_3(36/4) = \\log_3(9) = 2$
3. Power Law: $\\log_b(x^k) = k \\cdot \\log_b(x)$
   Critical Priority Rule: Always absorb front coefficients using the Power Law BEFORE combining terms with the Quotient or Product Law.
   Base Multi-Step Example: $2\\log_3(6) - \\log_3(4) = \\log_3(6^2) - \\log_3(4) = \\log_3(36/4) = \\log_3(9) = 2$`,
    excerpt: `Reference Sheet: Product, Quotient, and Power Laws of Logarithms (MHF4U Grade 12)
1. Product Law: $\\log_b(xy) = \\log_b(x) + \\log_b(y)$
2. Quotient Law: $\\log_b(x/y) = \\log_b(x) - \\log_b(y)$
3. Power Law: $\\log_b(x^k) = k \\cdot \\log_b(x)$`
  },
  {
    id: "lib-openstax-alg-quad",
    title: "OpenStax Algebra 2e — Completing the Square & Quadratics",
    curriculum: "US / Canada Math",
    subject: "Mathematics",
    gradeLevel: "Grade 10",
    source: "OpenStax Algebra & Trigonometry 2e (CC BY 4.0)",
    content: `Reference Sheet: Completing the Square & Quadratic Formula
1. Standard Form of a Quadratic Equation: $ax^2 + bx + c = 0$ ($a \\neq 0$)
2. Perfect Square Trinomial Identity: $(x + h)^2 = x^2 + 2hx + h^2$
3. Steps to Complete the Square on $x^2 + Bx + C = 0$:
   - Move constant to right side: $x^2 + Bx = -C$
   - Add $\\left(\\frac{B}{2}\\right)^2$ to both sides: $x^2 + Bx + \\left(\\frac{B}{2}\\right)^2 = -C + \\left(\\frac{B}{2}\\right)^2$
   - Factor into binomial square: $\\left(x + \\frac{B}{2}\\right)^2 = \\frac{B^2 - 4C}{4}$
4. Quadratic Formula & Discriminant: $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$, where $\\Delta = b^2 - 4ac$:
   - $\\Delta > 0$: Two distinct real roots
   - $\\Delta = 0$: One repeated real root (vertex on x-axis)
   - $\\Delta < 0$: No real roots (two complex conjugate roots)`,
    excerpt: `Reference Sheet: Completing the Square & Quadratic Formula
1. Standard Form: $ax^2 + bx + c = 0$ ($a \\neq 0$)
2. Perfect Square Trinomial: $(x + h)^2 = x^2 + 2hx + h^2$
3. Discriminant: $\\Delta = b^2 - 4ac$`
  },
  {
    id: "lib-openstax-chem-stoich",
    title: "OpenStax Chemistry 2e — Stoichiometry & Limiting Reactants",
    curriculum: "Science / Chemistry",
    subject: "Chemistry",
    gradeLevel: "Grade 11",
    source: "OpenStax Chemistry 2e & Ontario SCH3U",
    content: `Reference Sheet: Reaction Stoichiometry & Limiting Reactants
1. Balanced Chemical Equation (Synthesis of Water): $2\\text{H}_2(g) + \\text{O}_2(g) \\rightarrow 2\\text{H}_2\\text{O}(g)$
2. Molar Mass Conversion Formula: $n = \\frac{m}{M}$ (where $n$ = moles, $m$ = mass in grams, $M$ = molar mass in $\\text{g/mol}$)
   - $M(\\text{H}_2) = 2.016\\text{ g/mol}$, $M(\\text{O}_2) = 32.00\\text{ g/mol}$, $M(\\text{H}_2\\text{O}) = 18.015\\text{ g/mol}$
3. Finding the Limiting Reactant:
   - Step 1: Convert initial masses of all reactants from grams to moles ($n = \\frac{m}{M}$).
   - Step 2: Divide each reactant's moles by its stoichiometric coefficient in the balanced equation.
   - Step 3: The reactant with the smaller mole-to-coefficient ratio is the Limiting Reactant.
4. Percent Yield Formula: $\\text{Percent Yield} = \\frac{\\text{Actual Yield}}{\\text{Theoretical Yield}} \\times 100\\%$`,
    excerpt: `Reference Sheet: Reaction Stoichiometry & Limiting Reactants
1. Balanced Synthesis of Water: $2\\text{H}_2 + \\text{O}_2 \\rightarrow 2\\text{H}_2\\text{O}$
2. Mass-to-Mole Conversion: $n = \\frac{m}{M}$`
  },
  {
    id: "lib-openstax-bio-cell",
    title: "OpenStax Biology 2e — Cellular Respiration & Photosynthesis",
    curriculum: "Science / Biology",
    subject: "Biology",
    gradeLevel: "Grade 11",
    source: "OpenStax Biology 2e & Ontario SBI3U/SBI4U",
    content: `Reference Sheet: Cellular Energetics — Photosynthesis & Cellular Respiration
1. Photosynthesis Equation: $6\\text{CO}_2 + 6\\text{H}_2\\text{O} + \\text{Light Energy} \\rightarrow \\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2$
   - Light-Dependent Reactions (Thylakoid Membrane): Split $\\text{H}_2\\text{O}$ via photolysis ($2\\text{H}_2\\text{O} \\rightarrow 4\\text{H}^+ + 4e^- + \\text{O}_2$) and generate $\\text{ATP}$ and $\\text{NADPH}$.
   - Calvin Cycle (Stroma): Uses $\\text{ATP}$ and $\\text{NADPH}$ to fix $\\text{CO}_2$ into $\\text{G3P}$ via RuBisCO.
2. Cellular Respiration Equation: $\\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2 \\rightarrow 6\\text{CO}_2 + 6\\text{H}_2\\text{O} + 30\\text{–}32\\text{ ATP}$
   - Glycolysis (Cytoplasm) $\\rightarrow$ Pyruvate Oxidation $\\rightarrow$ Citric Acid Cycle $\\rightarrow$ Oxidative Phosphorylation (ETC & Chemiosmosis).`,
    excerpt: `Reference Sheet: Photosynthesis ($6\\text{CO}_2 + 6\\text{H}_2\\text{O} \\rightarrow \\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2$) & Cellular Respiration`
  },
  {
    id: "lib-openstax-phys-newton",
    title: "OpenStax Physics — Newton's Laws & Free-Body Diagrams",
    curriculum: "Science / Physics",
    subject: "Physics",
    gradeLevel: "Grade 11",
    source: "OpenStax University Physics Vol 1 & Ontario SPH3U/SPH4U",
    content: `Reference Sheet: Newton's Laws of Motion & Free-Body Diagrams
1. Newton's First Law (Inertia): $\\sum \\vec{F} = 0 \\Longleftrightarrow \\vec{a} = 0$ (constant velocity or at rest).
2. Newton's Second Law (Dynamics): $\\sum \\vec{F} = m\\vec{a}$ or $a = \\frac{F_{\\text{net}}}{m}$.
3. Newton's Third Law (Action-Reaction): $\\vec{F}_{AB} = -\\vec{F}_{BA}$.
4. Inclined Plane & Friction Formulas:
   - Weight components on angle $\\theta$: $F_{g\\parallel} = mg\\sin\\theta$, $F_{g\\perp} = mg\\cos\\theta$
   - Normal Force: $F_N = mg\\cos\\theta$ (on flat/inclined surface with no vertical applied force)
   - Kinetic/Static Friction: $F_f = \\mu F_N$`,
    excerpt: `Reference Sheet: Newton's Laws ($\\sum \\vec{F} = m\\vec{a}$) & Free-Body Diagrams`
  },
  {
    id: "lib-mcv4u-vectors-3d",
    title: "Ontario MCV4U — Lines, Planes & Vectors in 3-Space",
    curriculum: "Canada MCV4U",
    curriculumCode: "canada",
    recognizedType: "Curriculum Standard & Reference Sheet",
    subject: "Mathematics",
    gradeLevel: "Grade 12",
    source: "Ontario Ministry of Education MCV4U & OpenStax Calculus Vol 3",
    content: `Reference Sheet: Lines and Planes in 3-Dimensional Space ($\\mathbb{R}^3$)
1. Vector Equation of a Line in $\\mathbb{R}^3$: $\\vec{r} = \\vec{r}_0 + t\\vec{d}$, where $\\vec{r}_0 = (x_0, y_0, z_0)$ and direction vector $\\vec{d} = (a, b, c)$.
2. Dot Product & Orthogonality: $\\vec{u} \\cdot \\vec{v} = u_1v_1 + u_2v_2 + u_3v_3 = |\\vec{u}||\\vec{v}|\\cos\\theta$. Two vectors are perpendicular iff $\\vec{u} \\cdot \\vec{v} = 0$.
3. Scalar Equation of a Plane: $Ax + By + Cz + D = 0$ with normal vector $\\vec{n} = (A, B, C)$.
4. Line Relationships in $\\mathbb{R}^3$: Parallel distinct, Coincident, Intersecting at a unique point, or Skew (non-parallel and non-intersecting).`,
    excerpt: `Reference Sheet: Lines and Planes in 3-Space ($\\vec{r} = \\vec{r}_0 + t\\vec{d}$, Dot & Cross Products)`
  },
  {
    id: "lib-ap-calc-chain-rule",
    title: "College Board AP Calculus AB/BC — Derivatives, Chain Rule & Implicit Differentiation",
    curriculum: "US AP Calculus",
    curriculumCode: "us-ap",
    recognizedType: "Curriculum Standard & Formula Sheet",
    subject: "Mathematics",
    gradeLevel: "Grade 12",
    source: "College Board AP Calculus AB/BC CED (Units 2 & 3)",
    content: `AP Calculus AB/BC Curriculum & Reference Sheet: Differentiation Rules & Chain Rule
1. Power, Product, and Quotient Rules:
   - Power Rule: $\\frac{d}{dx}[x^n] = nx^{n-1}$
   - Product Rule: $\\frac{d}{dx}[f(x)g(x)] = f'(x)g(x) + f(x)g'(x)$
   - Quotient Rule: $\\frac{d}{dx}\\left[\\frac{f(x)}{g(x)}\\right] = \\frac{f'(x)g(x) - f(x)g'(x)}{[g(x)]^2}$
2. The Chain Rule (Composite Functions):
   - $\\frac{d}{dx}[f(g(x))] = f'(g(x)) \\cdot g'(x)$
   - Step-by-Step Worked Example: Differentiate $h(x) = (3x^2 + 1)^4$
     Step 1 (Outer Derivative): $4(3x^2 + 1)^3$
     Step 2 (Inner Derivative): $\\frac{d}{dx}(3x^2 + 1) = 6x$
     Step 3 (Multiply & Simplify): $h'(x) = 4(3x^2 + 1)^3 \\cdot 6x = 24x(3x^2 + 1)^3$`,
    excerpt: `AP Calculus AB/BC: Product, Quotient, and Chain Rule ($\\frac{d}{dx}[f(g(x))] = f'(g(x))g'(x)$)`
  },
  {
    id: "lib-ib-math-binomial-induction",
    title: "IB Diploma Mathematics AA HL/SL — Binomial Theorem & Sequences",
    curriculum: "IB Diploma (Math AA)",
    curriculumCode: "ib",
    recognizedType: "Curriculum Standard & Worked Examples",
    subject: "Mathematics",
    gradeLevel: "Grade 12",
    source: "International Baccalaureate Mathematics: Analysis & Approaches Guide",
    content: `IB Mathematics AA Curriculum Reference: Sequences, Series & Binomial Expansion
1. Arithmetic & Geometric Sequences:
   - Arithmetic $n$-th term: $u_n = u_1 + (n - 1)d$, Sum: $S_n = \\frac{n}{2}(2u_1 + (n-1)d)$
   - Geometric $n$-th term: $u_n = u_1 r^{n-1}$, Sum: $S_n = \\frac{u_1(r^n - 1)}{r - 1}$
2. Binomial Theorem for Positive Integers $n \\in \\mathbb{Z}^+$:
   - $(a + b)^n = \\sum_{r=0}^{n} \\binom{n}{r} a^{n-r} b^r$, where $\\binom{n}{r} = \\frac{n!}{r!(n-r)!}$
   - General Term: $T_{r+1} = \\binom{n}{r} a^{n-r} b^r$
   - Worked Example: Find the coefficient of $x^2$ in $(2 + x)^5$:
     Step 1: Identify $r = 2$: $T_3 = \\binom{5}{2} (2)^{5-2} x^2$
     Step 2: Evaluate $\\binom{5}{2} = 10$ and $2^3 = 8$
     Step 3: Multiply $10 \\cdot 8 = 80 \\implies 80x^2$.`,
    excerpt: `IB Math AA: Arithmetic/Geometric Series & Binomial Theorem $(a+b)^n = \\sum \\binom{n}{r}a^{n-r}b^r$`
  },
  {
    id: "lib-uk-alevel-trig-identities",
    title: "UK Cambridge A-Level Pure Math — Trigonometric Identities & Equations",
    curriculum: "UK A-Level / IGCSE",
    curriculumCode: "uk-alevel",
    recognizedType: "Curriculum Standard & Formula Sheet",
    subject: "Mathematics",
    gradeLevel: "Grade 12",
    source: "Cambridge International AS & A Level Mathematics (9709)",
    content: `Cambridge A-Level Pure Mathematics: Trigonometric Identities & Equations
1. Fundamental Identities:
   - $\\tan\\theta \\equiv \\frac{\\sin\\theta}{\\cos\\theta}$
   - Pythagorean Identity: $\\sin^2\\theta + \\cos^2\\theta \\equiv 1 \\implies 1 + \\tan^2\\theta \\equiv \\sec^2\\theta$
2. Double-Angle Identities:
   - $\\sin(2\\theta) \\equiv 2\\sin\\theta\\cos\\theta$
   - $\\cos(2\\theta) \\equiv \\cos^2\\theta - \\sin^2\\theta \\equiv 2\\cos^2\\theta - 1 \\equiv 1 - 2\\sin^2\\theta$
3. Step-by-Step Worked Example: Solve $2\\cos^2\\theta - \\cos\\theta - 1 = 0$ for $0 \\le \\theta \\le 2\\pi$:
   - Step 1 (Factor Quadratic in $\\cos\\theta$): $(2\\cos\\theta + 1)(\\cos\\theta - 1) = 0$
   - Step 2 (Solve each factor): $\\cos\\theta = 1 \\implies \\theta = 0, 2\\pi$; $\\cos\\theta = -\\frac{1}{2} \\implies \\theta = \\frac{2\\pi}{3}, \\frac{4\\pi}{3}$.`,
    excerpt: `Cambridge A-Level Pure Math: Pythagorean & Double-Angle Trigonometric Identities`
  },
  {
    id: "lib-bc-ab-math11-functions",
    title: "Canada BC / Alberta Math 11–12 — Radical & Rational Equations",
    curriculum: "Canada BC/Alberta",
    curriculumCode: "canada-bc-ab",
    recognizedType: "Curriculum Standard & Worked Examples",
    subject: "Mathematics",
    gradeLevel: "Grade 11",
    source: "BC Pre-Calculus 11/12 & Alberta Mathematics 20-1/30-1",
    content: `BC & Alberta Pre-Calculus Curriculum Reference: Rational & Radical Equations
1. Non-Permissible Values (Domain Restrictions):
   - For any rational expression $\\frac{P(x)}{Q(x)}$, set $Q(x) \\neq 0$ before multiplying through by the LCD.
   - For any even-index radical $\\sqrt{g(x)}$, require $g(x) \\ge 0$ and check for extraneous roots after squaring.
2. Worked Example: Solve $\\sqrt{2x + 3} = x$
   - Step 1 (Square both sides): $2x + 3 = x^2 \\implies x^2 - 2x - 3 = 0$
   - Step 2 (Factor): $(x - 3)(x + 1) = 0 \\implies x = 3$ or $x = -1$
   - Step 3 (Check Extraneous Roots): Substitute $x = 3$: $\\sqrt{9} = 3$ (Valid). Substitute $x = -1$: $\\sqrt{1} \\neq -1$ (Reject $x = -1$). Final Answer: $x = 3$.`,
    excerpt: `BC & Alberta Pre-Calculus: Non-Permissible Values, Rational & Radical Equations`
  }
];

