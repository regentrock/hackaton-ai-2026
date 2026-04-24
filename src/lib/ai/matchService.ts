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
}

export class MatchService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {}

  private async getAccessToken(): Promise<string> {
    // Se o token ainda é válido (por 50 minutos)
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
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 minutos

    if (!this.accessToken) {
      throw new Error('No access token received from IBM');
    }

    return this.accessToken;
  }

  async findBestMatches(
    user: UserProfile,
    projects: Project[],
    limit: number = 10
  ): Promise<MatchResult[]> {
    if (!projects || projects.length === 0) {
      return [];
    }

    // Se não tiver WatsonX configurado, usar fallback
    if (!process.env.IBM_API_KEY || !process.env.IBM_URL || !process.env.IBM_PROJECT_ID) {
      console.log('WatsonX not configured, using fallback matching');
      return this.fallbackMatch(user, projects, limit);
    }

    try {
      const accessToken = await this.getAccessToken();
      
      // Processar em lotes para evitar sobrecarga
      const batchSize = 5;
      const results: MatchResult[] = [];
      
      for (let i = 0; i < projects.length; i += batchSize) {
        const batch = projects.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(project => this.analyzeMatchWithAI(user, project, accessToken))
        );
        results.push(...batchResults);
        
        // Pequena pausa entre lotes
        if (i + batchSize < projects.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Ordenar por score e limitar
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
      
    } catch (error) {
      console.error('WatsonX match error:', error);
      return this.fallbackMatch(user, projects, limit);
    }
  }

  private async analyzeMatchWithAI(
    user: UserProfile,
    project: Project,
    accessToken: string
  ): Promise<MatchResult> {
    const prompt = this.buildMatchPrompt(user, project);
    
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
          max_new_tokens: 300,
          temperature: 0.1,
          min_new_tokens: 50,
          repetition_penalty: 1.0,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`WatsonX API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.results || !data.results[0]) {
      throw new Error('Invalid response from WatsonX');
    }

    const result = this.parseAIResponse(data.results[0].generated_text, project);
    return result;
  }

  private buildMatchPrompt(user: UserProfile, project: Project): string {
    return `You are an expert volunteer matching system. Analyze the match between a volunteer and a project.

VOLUNTEER PROFILE:
- Name: ${user.name}
- Skills: ${user.skills.join(', ')}
- Location: ${user.location}
- About: ${user.description || 'Volunteer interested in helping'}
- Availability: ${user.availability || 'Flexible'}

PROJECT DETAILS:
- Title: ${project.title}
- Organization: ${project.organization}
- Theme: ${project.theme || 'Social Impact'}
- Description: ${project.description.substring(0, 500)}
- Location: ${project.location}
- Required Skills: ${project.skills.join(', ')}

ANALYSIS TASKS:
1. Identify specific skills from the volunteer that match the project's needs
2. Identify skills the volunteer should develop to improve match
3. Provide a match score from 0 to 100 (higher = better match)
4. Explain the reasoning in Portuguese

OUTPUT FORMAT (JSON):
{
  "score": number,
  "reasoning": "string explaining why this is a good/poor match",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "recommendation": "string with specific advice in Portuguese"
}

CRITICAL: Return ONLY valid JSON, no other text.`;
  }

  private parseAIResponse(aiText: string, project: Project): MatchResult {
    try {
      // Limpar a resposta
      let cleanText = aiText.replace(/```json\n?/g, '');
      cleanText = cleanText.replace(/```\n?/g, '');
      cleanText = cleanText.trim();
      
      // Encontrar JSON
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        projectId: project.id,
        score: Math.min(100, Math.max(0, parsed.score || 50)),
        reasoning: parsed.reasoning || this.generateDefaultReasoning(project),
        matchedSkills: parsed.matchedSkills || [],
        missingSkills: parsed.missingSkills || [],
        recommendation: parsed.recommendation || "Considere se candidatar a esta oportunidade!"
      };
      
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return this.createFallbackResult(project);
    }
  }

  private fallbackMatch(user: UserProfile, projects: Project[], limit: number): MatchResult[] {
    const results: MatchResult[] = [];
    
    for (const project of projects) {
      const userSkillsLower = user.skills.map(s => s.toLowerCase());
      const projectSkillsLower = project.skills.map(s => s.toLowerCase());
      
      // Calcular match de habilidades
      const matchedSkills: string[] = [];
      const missingSkills: string[] = [];
      
      for (const projectSkill of projectSkillsLower) {
        let matched = false;
        for (const userSkill of userSkillsLower) {
          if (userSkill.includes(projectSkill) || projectSkill.includes(userSkill)) {
            matched = true;
            matchedSkills.push(projectSkill);
            break;
          }
        }
        if (!matched) {
          missingSkills.push(projectSkill);
        }
      }
      
      const score = userSkillsLower.length > 0 
        ? (matchedSkills.length / projectSkillsLower.length) * 100
        : 50;
      
      results.push({
        projectId: project.id,
        score: Math.min(100, Math.max(0, Math.floor(score))),
        reasoning: this.generateDefaultReasoning(project),
        matchedSkills: matchedSkills.slice(0, 3),
        missingSkills: missingSkills.slice(0, 3),
        recommendation: this.generateDefaultRecommendation(matchedSkills)
      });
    }
    
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private createFallbackResult(project: Project): MatchResult {
    return {
      projectId: project.id,
      score: 50,
      reasoning: "Projeto interessante baseado na sua localização.",
      matchedSkills: [],
      missingSkills: [],
      recommendation: "Recomendamos avaliar este projeto!"
    };
  }

  private generateDefaultReasoning(project: Project): string {
    return `Projeto: ${project.title} da organização ${project.organization}. Uma oportunidade na área de ${project.theme || 'impacto social'}.`;
  }

  private generateDefaultRecommendation(matchedSkills: string[]): string {
    if (matchedSkills.length > 0) {
      return `Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são relevantes. Candidate-se!`;
    }
    return "Considere desenvolver habilidades específicas para melhorar seu match.";
  }
}