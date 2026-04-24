interface UserProfile {
  name: string;
  skills: string[];
  location: string;
  description: string;
  availability: string;
}

interface Project {
  id: string;
  title: string;
  organization: string;
  description: string;
  theme: string;
  location: string;
  skills: string[];
}

interface MatchResult {
  projectId: string;
  score: number;
  reasoning: string;
  matchedSkills: string[];
  missingSkills: string[];
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
}

export class MatchService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {}

  private async getAccessToken(): Promise<string> {
    // Se já temos um token válido
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const apiKey = process.env.IBM_API_KEY;
    const url = 'https://iam.cloud.ibm.com/identity/token';

    if (!apiKey) {
      throw new Error('IBM_API_KEY not configured');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apiKey}`,
    });

    if (!response.ok) {
      throw new Error('Failed to get IBM access token');
    }

    const data = await response.json();
    const newToken = data.access_token;
    
    if (!newToken || typeof newToken !== 'string') {
      throw new Error('No valid access token received from IBM');
    }
    
    // Armazenar o token
    this.accessToken = newToken;
    this.tokenExpiry = Date.now() + 50 * 60 * 1000;

    // Retornar o token (garantindo que é string)
    return this.accessToken;
  }

  async findBestMatches(
    user: UserProfile,
    projects: Project[],
    limit: number = 10
  ): Promise<MatchResult[]> {
    console.log('=== MATCH SERVICE ===');
    console.log('User skills:', user.skills);
    console.log('Total projects:', projects.length);

    if (!projects || projects.length === 0) {
      return [];
    }

    const filteredProjects = this.preFilterBySkills(user, projects);
    console.log(`After pre-filter: ${filteredProjects.length} projects`);

    if (filteredProjects.length === 0) {
      return [];
    }

    try {
      const accessToken = await this.getAccessToken();
      const results: MatchResult[] = [];
      
      for (let i = 0; i < filteredProjects.length; i++) {
        const project = filteredProjects[i];
        console.log(`Analyzing ${i + 1}/${filteredProjects.length}: ${project.title}`);
        
        const result = await this.analyzeMatchWithAI(user, project, accessToken);
        results.push(result);
        
        if (i < filteredProjects.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
      
    } catch (error) {
      console.error('WatsonX error:', error);
      return this.fallbackMatch(user, filteredProjects, limit);
    }
  }

  private preFilterBySkills(user: UserProfile, projects: Project[]): Project[] {
    const userSkills = user.skills.map(s => s.toLowerCase().trim());
    
    if (userSkills.length === 0) {
      return projects.slice(0, 10);
    }
    
    const scored = projects.map(project => {
      const projectSkills = project.skills.map(s => s.toLowerCase());
      const projectText = `${project.title} ${project.description} ${project.theme}`.toLowerCase();
      
      let score = 0;
      const matchedSkills: string[] = [];
      
      for (const userSkill of userSkills) {
        for (const projSkill of projectSkills) {
          if (projSkill.includes(userSkill) || userSkill.includes(projSkill)) {
            score += 10;
            matchedSkills.push(projSkill);
            break;
          }
        }
      }
      
      for (const userSkill of userSkills) {
        if (projectText.includes(userSkill)) {
          score += 3;
        }
      }
      
      return { project, score, matchedSkillsCount: matchedSkills.length };
    });
    
    let filtered = scored.filter(p => p.score > 0);
    
    if (filtered.length === 0) {
      filtered = scored.filter(p => {
        const projectText = `${p.project.title} ${p.project.description}`.toLowerCase();
        return userSkills.some(skill => projectText.includes(skill));
      });
    }
    
    if (filtered.length === 0 && projects.length > 0) {
      filtered = scored.slice(0, 5);
    }
    
    filtered.sort((a, b) => b.score - a.score);
    return filtered.slice(0, 15).map(f => f.project);
  }

  private async analyzeMatchWithAI(
    user: UserProfile,
    project: Project,
    accessToken: string
  ): Promise<MatchResult> {
    const prompt = this.buildUltraSpecificPrompt(user, project);
    
    const response = await fetch(`${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: prompt,
        model_id: "ibm/granite-3-8b-instruct",
        project_id: process.env.IBM_PROJECT_ID,
        parameters: {
          decoding_method: "greedy",
          max_new_tokens: 400,
          temperature: 0.1,
          min_new_tokens: 100,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`WatsonX API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.results[0].generated_text;
    
    return this.parseAIResponse(aiResponse, project, user);
  }

  private buildUltraSpecificPrompt(user: UserProfile, project: Project): string {
    const userSkillsList = user.skills.map(s => `- ${s}`).join('\n');
    const projectSkillsList = project.skills.map(s => `- ${s}`).join('\n');
    
    return `You are a strict volunteer matching system. Your ONLY job is to compare the volunteer's skills with what this project needs.

=== VOLUNTEER'S SKILLS ===
${userSkillsList}

=== PROJECT'S REQUIRED SKILLS ===
${projectSkillsList}

=== PROJECT DETAILS ===
Title: ${project.title}
Organization: ${project.organization}
Theme: ${project.theme || 'Social Impact'}
Description: ${project.description.substring(0, 500)}

=== YOUR TASK ===
1. Compare EACH volunteer skill with EACH project required skill
2. Find EXACT matches or VERY CLOSE matches
3. Calculate match score based on: (number of matched skills / number of project skills) * 100
4. If volunteer has skills that help but project doesn't explicitly list them, give partial credit

=== CRITICAL RULES ===
- Score MUST be based primarily on skill overlap
- Be specific about WHICH skills match
- Write reasoning in Portuguese
- Recommendation MUST reference specific skills

=== OUTPUT FORMAT (JSON ONLY) ===
{
  "score": number (0-100),
  "reasoning": "Em português: O voluntário possui as habilidades [X, Y] que são relevantes para este projeto porque...",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "recommendation": "Em português: Com base nas suas habilidades em [X, Y], você é um bom candidato porque..."
}

Return ONLY valid JSON. No other text.`;
  }

  private parseAIResponse(aiText: string, project: Project, user: UserProfile): MatchResult {
    try {
      let cleanText = aiText.replace(/```json\n?/g, '');
      cleanText = cleanText.replace(/```\n?/g, '');
      cleanText = cleanText.trim();
      
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      const validMatchedSkills = (parsed.matchedSkills || []).filter((skill: string) =>
        user.skills.some(us => 
          us.toLowerCase().includes(skill.toLowerCase()) || 
          skill.toLowerCase().includes(us.toLowerCase())
        )
      );
      
      let score = parsed.score;
      if (!score || score < 0 || score > 100) {
        score = this.calculateScoreFromSkills(user, project);
      }
      
      score = Math.min(100, Math.max(0, score));
      
      const priority: 'high' | 'medium' | 'low' = 
        score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
      
      return {
        projectId: project.id,
        score,
        reasoning: parsed.reasoning || this.generateReasoningFromSkills(project, validMatchedSkills),
        matchedSkills: validMatchedSkills.slice(0, 5),
        missingSkills: (parsed.missingSkills || []).slice(0, 3),
        recommendation: parsed.recommendation || this.generateRecommendationFromSkills(score, validMatchedSkills),
        priority
      };
      
    } catch (error) {
      console.error('Parse error:', error);
      return this.createFallbackResult(project, user);
    }
  }

  private calculateScoreFromSkills(user: UserProfile, project: Project): number {
    const userSkills = user.skills.map(s => s.toLowerCase());
    const projectSkills = project.skills.map(s => s.toLowerCase());
    
    if (projectSkills.length === 0) return 30;
    if (userSkills.length === 0) return 25;
    
    let matchCount = 0;
    for (const userSkill of userSkills) {
      for (const projSkill of projectSkills) {
        if (projSkill.includes(userSkill) || userSkill.includes(projSkill)) {
          matchCount++;
          break;
        }
      }
    }
    
    return Math.floor((matchCount / projectSkills.length) * 100);
  }

  private generateReasoningFromSkills(project: Project, matchedSkills: string[]): string {
    if (matchedSkills.length === 0) {
      return `O projeto "${project.title}" busca voluntários. Sua experiência pode contribuir de forma valiosa.`;
    }
    
    const skillsText = matchedSkills.slice(0, 3).join(', ');
    return `✅ Suas habilidades em ${skillsText} são diretamente relevantes para o projeto "${project.title}". Este é um bom match de perfil!`;
  }

  private generateRecommendationFromSkills(score: number, matchedSkills: string[]): string {
    if (score >= 70 && matchedSkills.length > 0) {
      return `🎯 EXCELENTE! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são exatamente o que este projeto procura. Candidate-se agora!`;
    } else if (score >= 40) {
      if (matchedSkills.length > 0) {
        return `👍 BOM POTENCIAL! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são relevantes. Esta é uma ótima oportunidade para você.`;
      }
      return `👍 OPORTUNIDADE INTERESSANTE! Considere se candidatar para ganhar experiência.`;
    }
    return `📚 OPORTUNIDADE DE APRENDIZADO! Este projeto pode ajudar você a desenvolver novas habilidades.`;
  }

  private fallbackMatch(user: UserProfile, projects: Project[], limit: number): MatchResult[] {
    const results = projects.map(project => this.createFallbackResult(project, user));
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private createFallbackResult(project: Project, user: UserProfile): MatchResult {
    const score = this.calculateScoreFromSkills(user, project);
    const userSkills = user.skills.map(s => s.toLowerCase());
    const projectSkills = project.skills.map(s => s.toLowerCase());
    
    const matchedSkills = projectSkills.filter(ps =>
      userSkills.some(us => us.includes(ps) || ps.includes(us))
    );
    
    const priority: 'high' | 'medium' | 'low' = 
      score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
    
    return {
      projectId: project.id,
      score,
      reasoning: this.generateReasoningFromSkills(project, matchedSkills),
      matchedSkills: matchedSkills.slice(0, 5),
      missingSkills: [],
      recommendation: this.generateRecommendationFromSkills(score, matchedSkills),
      priority
    };
  }
}